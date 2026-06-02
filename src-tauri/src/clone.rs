//! Clonación de bases de datos con COPY binary directo PG→PG.
//!
//! Estrategia (inspirada en `migration-app/src/environment/clone_environment.py`):
//!   1. pg_dump --section=pre-data + --section=post-data del origen, en paralelo
//!   2. Recrear/limpiar destino + aplicar pre-data
//!   3. COPY binary tabla a tabla en paralelo (sin índices ni FKs activas)
//!   4. Aplicar post-data + resetear secuencias
//!
//! Por qué es rápido:
//!   - COPY binary directo PG→PG vía socket (sin archivo intermedio, sin serialización a texto)
//!   - Stream chunked entre origen y destino (no buffer completo en RAM para tablas grandes)
//!   - N tablas en paralelo (LPT scheduling: ordenadas por tamaño desc)
//!   - Settings agresivos durante COPY: synchronous_commit=off, work_mem alto
//!   - Indices y FKs se aplican una sola vez al final sobre la tabla ya llena

use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use tokio::task::JoinSet;
use tokio_postgres::Client;

use crate::command_helper::create_command;
use crate::connection::get_profile_by_id;
use crate::pg_client::connect;
use crate::pg_tools::{find_pg_dump, find_pg_dump_for_server_version, find_psql};
use crate::storage::{load_app_data, save_app_data};
use crate::types::{
    CloneHistoryEntry, CloneOptions, CloneProgress, CloneStatus, CloneType, ConnectionProfile,
};

const COPY_SESSION_SETTINGS: &str = "SET LOCAL synchronous_commit = off; \
     SET LOCAL work_mem = '256MB'; \
     SET LOCAL maintenance_work_mem = '1GB';";

const POST_DATA_PREFIX: &str = "SET maintenance_work_mem = '2GB';\n\
     SET synchronous_commit = off;\n";

fn get_parallel_jobs() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4)
        .clamp(2, 8)
}

fn format_duration_human(secs: f64) -> String {
    let total_secs = secs as u64;
    let minutes = total_secs / 60;
    let seconds = total_secs % 60;
    if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{:.1}s", secs)
    }
}

fn emit_progress(app: &AppHandle, progress: CloneProgress) {
    let _ = app.emit("clone-progress", &progress);
}

fn emit_log(app: &AppHandle, log: &str) {
    let _ = app.emit("clone-log", log);
}

#[tauri::command]
pub async fn start_clone(app: AppHandle, options: CloneOptions) -> Result<String, String> {
    let source = get_profile_by_id(&options.source_id).ok_or("Source profile not found")?;
    let destination =
        get_profile_by_id(&options.destination_id).ok_or("Destination profile not found")?;

    // Defense-in-depth: aunque la UI filtra los read-only del selector de destino,
    // validamos en el backend antes de hacer cualquier cosa por si la llamada IPC
    // llega directa con un id protegido.
    if destination.read_only {
        return Err(format!(
            "'{}' is marked as protected (read-only) and cannot be used as a clone destination",
            destination.name
        ));
    }

    let baseline_psql =
        find_psql().ok_or("psql not found. Please install PostgreSQL client tools.")?;
    let server_major = get_server_major_version(&baseline_psql, &source).await;

    let pg_dump = if let Some(major) = server_major {
        find_pg_dump_for_server_version(major)
            .ok_or("pg_dump not found. Please install PostgreSQL client tools.")?
    } else {
        find_pg_dump().ok_or("pg_dump not found. Please install PostgreSQL client tools.")?
    };

    let history_entry = Arc::new(Mutex::new(CloneHistoryEntry::new(
        &source,
        &destination,
        options.clone_type.clone(),
    )));
    let entry_id = history_entry.lock().unwrap().id.clone();

    let history_clone = Arc::clone(&history_entry);
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let result = execute_clone(
            &app_clone,
            &pg_dump,
            &source,
            &destination,
            &options,
            &history_clone,
        )
        .await;

        let mut data = load_app_data();
        let mut entry = history_clone.lock().unwrap().clone();

        match result {
            Ok(_) => {
                entry.complete(CloneStatus::Success, None);
                emit_progress(
                    &app_clone,
                    CloneProgress::completed("Clone completed successfully!"),
                );
            }
            Err(e) => {
                entry.complete(CloneStatus::Error, Some(e.clone()));
                emit_progress(&app_clone, CloneProgress::error(&e));
            }
        }

        data.history.insert(0, entry);
        data.history.truncate(50);
        let _ = save_app_data(&data);
    });

    Ok(entry_id)
}

async fn get_server_major_version(psql: &str, source: &ConnectionProfile) -> Option<u32> {
    let conn_str = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );
    let output = create_command(psql)
        .env("PGPASSWORD", &source.password)
        .env("PGSSLMODE", if source.ssl { "require" } else { "prefer" })
        .args(["-d", &conn_str, "-t", "-c", "SHOW server_version_num;"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let version_num: u32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .ok()?;
    Some(version_num / 10000)
}

async fn execute_clone(
    app: &AppHandle,
    pg_dump: &str,
    source: &ConnectionProfile,
    destination: &ConnectionProfile,
    options: &CloneOptions,
    history: &Arc<Mutex<CloneHistoryEntry>>,
) -> Result<(), String> {
    let total_start = Instant::now();

    let add_log = |msg: &str| {
        emit_log(app, msg);
        if let Ok(mut entry) = history.lock() {
            entry.add_log(msg.to_string());
        }
    };

    emit_progress(
        app,
        CloneProgress::new("preparing", 2, "Preparing clone operation..."),
    );
    add_log(&format!(
        "[INFO] Starting clone from '{}' to '{}'",
        source.name, destination.name
    ));
    add_log(&format!("[INFO] Clone type: {:?}", options.clone_type));
    add_log(&format!("[INFO] Using pg_dump: {}", pg_dump));

    let workers = get_parallel_jobs();
    add_log(&format!("[INFO] Parallel workers: {}", workers));

    let wants_schema = !matches!(options.clone_type, CloneType::Data);
    let wants_data = !matches!(options.clone_type, CloneType::Structure);

    // ── Optional backup (mantenido tal cual: pg_dump a archivo) ─────────────
    if options.create_backup {
        emit_progress(
            app,
            CloneProgress::new("backup", 8, "Creating backup of destination..."),
        );
        add_log("[INFO] Creating backup of destination database...");
        if let Err(e) = create_backup(pg_dump, destination).await {
            add_log(&format!("[WARNING] Backup failed: {}", e));
        } else {
            add_log("[SUCCESS] Backup created");
        }
    }

    // ── Stage 1: Dump pre-data + post-data del origen (paralelo) ────────────
    let (pre_data_sql, post_data_sql) = if wants_schema {
        emit_progress(
            app,
            CloneProgress::new("dumping_schema", 10, "Dumping schema (pre + post data)..."),
        );
        add_log("[INFO] Dumping pre-data and post-data sections in parallel...");

        let dump_start = Instant::now();
        let pg_dump_pre = pg_dump.to_string();
        let pg_dump_post = pg_dump.to_string();
        let source_pre = source.clone();
        let source_post = source.clone();

        let pre_handle =
            tokio::spawn(async move { dump_section(&pg_dump_pre, &source_pre, "pre-data").await });
        let post_handle = tokio::spawn(async move {
            dump_section(&pg_dump_post, &source_post, "post-data").await
        });

        let pre = pre_handle
            .await
            .map_err(|e| format!("pre-data task panic: {}", e))??;
        let post = post_handle
            .await
            .map_err(|e| format!("post-data task panic: {}", e))??;

        add_log(&format!(
            "[SUCCESS] Schema dumped in {} (pre-data {} KB, post-data {} KB)",
            format_duration_human(dump_start.elapsed().as_secs_f64()),
            pre.len() / 1024,
            post.len() / 1024,
        ));
        (Some(pre), Some(post))
    } else {
        (None, None)
    };

    // ── Stage 2: Limpiar destino + aplicar pre-data ─────────────────────────
    let dest_client = connect(destination).await?;

    if options.clean_destination {
        emit_progress(
            app,
            CloneProgress::new("cleaning", 20, "Cleaning destination..."),
        );
        if wants_schema {
            add_log("[INFO] Dropping and recreating public schema...");
            dest_client
                .batch_execute(
                    "DROP SCHEMA public CASCADE; \
                     CREATE SCHEMA public; \
                     GRANT ALL ON SCHEMA public TO PUBLIC;",
                )
                .await
                .map_err(|e| format!("Failed to clean destination: {}", e))?;
            add_log("[SUCCESS] Destination schema dropped and recreated");
        } else {
            add_log("[INFO] Truncating destination tables (preserving structure)...");
            dest_client
                .batch_execute(
                    "DO $$ DECLARE r RECORD; BEGIN \
                       SET session_replication_role = 'replica'; \
                       FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP \
                         EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE'; \
                       END LOOP; \
                       SET session_replication_role = 'origin'; \
                     END $$;",
                )
                .await
                .map_err(|e| format!("Failed to truncate destination: {}", e))?;
            add_log("[SUCCESS] Destination tables truncated");
        }
    }

    if let Some(pre_sql) = pre_data_sql.as_deref() {
        emit_progress(
            app,
            CloneProgress::new("schema_pre", 25, "Applying schema (pre-data)..."),
        );
        add_log("[INFO] Applying pre-data schema (tables, types, sequences)...");
        let (ok, skipped, errs) = apply_sql_lenient(&dest_client, pre_sql).await?;
        if skipped > 0 {
            add_log(&format!(
                "[INFO] Pre-data: {} statements applied, {} skipped (objects already exist)",
                ok, skipped
            ));
        } else {
            add_log(&format!("[INFO] Pre-data: {} statements applied", ok));
        }
        if !errs.is_empty() {
            for err in &errs {
                add_log(&format!("[ERROR] pre-data: {}", err));
            }
            return Err(format!(
                "Pre-data failed with {} error(s). First: {}",
                errs.len(),
                errs.first().cloned().unwrap_or_default()
            ));
        }
        add_log("[SUCCESS] Pre-data schema applied");
    }

    // ── Stage 3: COPY binary tabla a tabla en paralelo ──────────────────────
    let mut copy_duration_secs = 0.0_f64;
    let mut total_bytes: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    if wants_data {
        emit_progress(
            app,
            CloneProgress::new("inventory", 30, "Inventorying source tables..."),
        );

        let src_client = connect(source).await?;
        let tables = get_tables(&src_client, &options.exclude_tables).await?;
        drop(src_client);

        let total_tables = tables.len();
        add_log(&format!("[INFO] {} tables to copy", total_tables));

        if total_tables > 0 {
            let copy_start = Instant::now();
            emit_progress(
                app,
                CloneProgress::new(
                    "copying",
                    35,
                    &format!("Copying data ({} workers in parallel)...", workers),
                ),
            );

            let (done_bytes, errs) =
                copy_all_tables(app, source, destination, tables, workers, history).await;
            total_bytes = done_bytes;
            errors = errs;
            copy_duration_secs = copy_start.elapsed().as_secs_f64();

            if errors.is_empty() {
                add_log(&format!(
                    "[SUCCESS] {} tables copied — {:.1} MB transferred in {}",
                    total_tables,
                    total_bytes as f64 / 1_048_576.0,
                    format_duration_human(copy_duration_secs)
                ));
            } else {
                add_log(&format!(
                    "[WARNING] {} tables failed during COPY",
                    errors.len()
                ));
                for err in &errors {
                    add_log(&format!("[ERROR] {}", err));
                }
            }
        }
    }

    // ── Stage 4: Post-data + secuencias ─────────────────────────────────────
    if let Some(post_sql) = post_data_sql.as_deref() {
        emit_progress(
            app,
            CloneProgress::new("schema_post", 90, "Applying schema (indexes, FKs)..."),
        );
        add_log("[INFO] Applying post-data schema (indexes, constraints, FKs)...");
        let post_with_prefix = format!("{}{}", POST_DATA_PREFIX, post_sql);
        let (ok, skipped, errs) = apply_sql_lenient(&dest_client, &post_with_prefix).await?;
        if skipped > 0 {
            add_log(&format!(
                "[INFO] Post-data: {} statements applied, {} skipped (already exist)",
                ok, skipped
            ));
        } else {
            add_log(&format!("[INFO] Post-data: {} statements applied", ok));
        }
        if !errs.is_empty() {
            for err in &errs {
                add_log(&format!("[ERROR] post-data: {}", err));
            }
            return Err(format!(
                "Post-data failed with {} error(s). First: {}",
                errs.len(),
                errs.first().cloned().unwrap_or_default()
            ));
        }
        add_log("[SUCCESS] Post-data schema applied");
    }

    if wants_data {
        emit_progress(
            app,
            CloneProgress::new("sequences", 95, "Resetting sequences..."),
        );
        match reset_sequences(source, &dest_client).await {
            Ok(n) if n > 0 => add_log(&format!("[SUCCESS] {} sequences reset", n)),
            Ok(_) => {}
            Err(e) => add_log(&format!("[WARNING] Sequence reset failed: {}", e)),
        }
    }

    // ── Verificación final ─────────────────────────────────────────────────
    emit_progress(app, CloneProgress::new("verifying", 98, "Verifying clone..."));
    if let Ok(row) = dest_client
        .query_one(
            "SELECT COUNT(*)::bigint FROM information_schema.tables \
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
            &[],
        )
        .await
    {
        let count: i64 = row.get(0);
        add_log(&format!(
            "[SUCCESS] Verification complete. Tables in destination: {}",
            count
        ));
    }

    let total_duration = total_start.elapsed();
    add_log(&format!(
        "[SUCCESS] Clone completed in {}",
        format_duration_human(total_duration.as_secs_f64())
    ));
    add_log(&format!(
        "[INFO] Breakdown — COPY: {} ({:.1} MB) | Total: {}",
        format_duration_human(copy_duration_secs),
        total_bytes as f64 / 1_048_576.0,
        format_duration_human(total_duration.as_secs_f64()),
    ));

    if !errors.is_empty() {
        let first = errors.first().cloned().unwrap_or_default();
        return Err(format!(
            "{} tables failed during COPY. First: {}",
            errors.len(),
            first
        ));
    }

    Ok(())
}

// ─── pg_dump helpers ────────────────────────────────────────────────────────

async fn dump_section(
    pg_dump: &str,
    source: &ConnectionProfile,
    section: &str,
) -> Result<String, String> {
    let conn_str = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );

    let output = create_command(pg_dump)
        .env("PGPASSWORD", &source.password)
        .env("PGSSLMODE", if source.ssl { "require" } else { "prefer" })
        .args([
            "-d",
            &conn_str,
            "--format=plain",
            &format!("--section={}", section),
            "--no-owner",
            "--no-acl",
            "--no-comments",
            "--no-privileges",
        ])
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("pg_dump --section={} failed to spawn: {}", section, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pg_dump --section={} failed: {}", section, stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn create_backup(pg_dump: &str, destination: &ConnectionProfile) -> Result<(), String> {
    let backup_name = format!(
        "{}_backup_{}.sql",
        destination.database,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let backup_path = dirs::data_local_dir()
        .map(|d| d.join("db-clone-app").join("backups").join(&backup_name))
        .ok_or("Could not determine backup directory")?;

    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let conn_str = format!(
        "host={} port={} dbname={} user={}",
        destination.host, destination.port, destination.database, destination.user
    );

    let output = create_command(pg_dump)
        .env("PGPASSWORD", &destination.password)
        .env(
            "PGSSLMODE",
            if destination.ssl { "require" } else { "prefer" },
        )
        .args(["-d", &conn_str, "-f", backup_path.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to spawn pg_dump for backup: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.into_owned());
    }
    Ok(())
}

// ─── SQL application ────────────────────────────────────────────────────────

/// SQLSTATE codes que son "no-fatal" — objetos preinstalados por la BD destino
/// (típicamente Aiven, RDS, Supabase y otras managed): schemas, extensiones,
/// roles, funciones o tipos que el origen también tenía pero que ya están en
/// el destino. Replica el comportamiento de `psql --set ON_ERROR_STOP=0`.
const NON_FATAL_SQLSTATES: &[&str] = &[
    "42P06", // duplicate_schema
    "42P07", // duplicate_table
    "42710", // duplicate_object (extension, type, etc.)
    "42723", // duplicate_function
    "42704", // undefined_object (DROP IF EXISTS sin IF EXISTS, etc.)
    "42883", // undefined_function
    "42P01", // undefined_table (DROP sin IF EXISTS)
    "42P16", // invalid_table_definition (alter sobre cosa ya correcta)
    "23505", // unique_violation (datos preinstalados)
    "23503", // foreign_key_violation: FKs que el origen tolera por datos huérfanos.
    //          Postgres valida los datos existentes al crear la FK; si el origen
    //          tiene filas huérfanas (clinics borradas, etc.) la FK se salta y
    //          la BD local queda sin esa FK específica. Replica `ON_ERROR_STOP=0` del psql.
    "0A000", // feature_not_supported (extensiones cloud-only: aiven_extras, etc.)
];

/// pg_dump 17+ emite meta-comandos psql (\restrict, \unrestrict, \connect, etc.)
/// que tokio-postgres no entiende — son extensiones del cliente psql.
/// Los filtramos línea a línea antes de aplicar el SQL.
fn sanitize_pg_dump_sql(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    for line in sql.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('\\') {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// Divide un script SQL en statements individuales, respetando:
///   - Strings simples ('...') con escape ''
///   - Dollar-quoted blocks ($$...$$ y $tag$...$tag$) — usados en funciones, triggers
///   - Comentarios de línea (-- ...)
///   - Comentarios de bloque (/* ... */)
fn split_sql_statements(sql: &str) -> Vec<String> {
    let bytes = sql.as_bytes();
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut i = 0;
    let len = bytes.len();

    while i < len {
        let c = bytes[i] as char;

        // Comentario de línea
        if c == '-' && i + 1 < len && bytes[i + 1] as char == '-' {
            while i < len && bytes[i] as char != '\n' {
                current.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }

        // Comentario de bloque
        if c == '/' && i + 1 < len && bytes[i + 1] as char == '*' {
            current.push('/');
            current.push('*');
            i += 2;
            while i + 1 < len && !(bytes[i] as char == '*' && bytes[i + 1] as char == '/') {
                current.push(bytes[i] as char);
                i += 1;
            }
            if i + 1 < len {
                current.push('*');
                current.push('/');
                i += 2;
            }
            continue;
        }

        // String simple
        if c == '\'' {
            current.push('\'');
            i += 1;
            while i < len {
                let cc = bytes[i] as char;
                current.push(cc);
                i += 1;
                if cc == '\'' {
                    // ''escape o cierre
                    if i < len && bytes[i] as char == '\'' {
                        current.push('\'');
                        i += 1;
                        continue;
                    }
                    break;
                }
            }
            continue;
        }

        // Dollar-quoted block
        if c == '$' {
            // Leer el tag: $tag$ o $$
            let mut j = i + 1;
            while j < len {
                let cc = bytes[j] as char;
                if cc == '$' {
                    break;
                }
                if !(cc.is_ascii_alphanumeric() || cc == '_') {
                    // No es dollar-quote válido
                    j = i;
                    break;
                }
                j += 1;
            }
            if j > i && j < len && bytes[j] as char == '$' {
                // Tag válido: bytes[i..=j] es "$tag$"
                let tag = &sql[i..=j];
                current.push_str(tag);
                i = j + 1;
                // Buscar el cierre del mismo tag
                while i < len {
                    if bytes[i] as char == '$' && sql[i..].starts_with(tag) {
                        current.push_str(tag);
                        i += tag.len();
                        break;
                    }
                    current.push(bytes[i] as char);
                    i += 1;
                }
                continue;
            }
        }

        // Fin de statement
        if c == ';' {
            current.push(';');
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                statements.push(trimmed.to_string());
            }
            current.clear();
            i += 1;
            continue;
        }

        current.push(c);
        i += 1;
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }

    statements
}

/// Extrae un snippet del statement SQL para mensajes de error,
/// saltándose comentarios `--` que pg_dump emite antes de cada DDL.
fn statement_snippet(stmt: &str) -> String {
    let first_real = stmt
        .lines()
        .find(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with("--")
        })
        .unwrap_or("");
    let snippet = first_real.trim();
    if snippet.len() > 140 {
        format!("{}...", &snippet[..140])
    } else {
        snippet.to_string()
    }
}

/// Aplica SQL statement-por-statement, tolerando errores "ya existe" / "no existe"
/// que son típicos cuando el destino tiene objetos preinstalados (Aiven, etc.).
///
/// Retorna `(ok_count, skipped_count, errors)`.
async fn apply_sql_lenient(
    client: &Client,
    sql: &str,
) -> Result<(usize, usize, Vec<String>), String> {
    let sanitized = sanitize_pg_dump_sql(sql);
    let statements = split_sql_statements(&sanitized);

    let mut ok = 0_usize;
    let mut skipped = 0_usize;
    let mut errors: Vec<String> = Vec::new();

    for stmt in statements {
        match client.simple_query(&stmt).await {
            Ok(_) => ok += 1,
            Err(e) => {
                if let Some(db_err) = e.as_db_error() {
                    let code = db_err.code().code();
                    if NON_FATAL_SQLSTATES.contains(&code) {
                        skipped += 1;
                        continue;
                    }
                    errors.push(format!(
                        "SQLSTATE {} {}: {} [on: {}]",
                        code,
                        db_err.severity(),
                        db_err.message(),
                        statement_snippet(&stmt)
                    ));
                } else {
                    errors.push(format!("{}", e));
                }
            }
        }
    }

    Ok((ok, skipped, errors))
}

// ─── Table inventory ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct TableRef {
    schema: String,
    table: String,
    est_rows: i64,
}

async fn get_tables(
    client: &Client,
    exclude: &[String],
) -> Result<Vec<TableRef>, String> {
    let rows = client
        .query(
            "SELECT n.nspname, c.relname, greatest(c.reltuples::bigint, 0) AS est_rows \
             FROM pg_class c \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE c.relkind = 'r' \
               AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') \
             ORDER BY c.relpages DESC",
            &[],
        )
        .await
        .map_err(|e| format!("Failed to inventory tables: {}", e))?;

    let exclude_set: std::collections::HashSet<String> = exclude.iter().cloned().collect();
    let mut tables = Vec::with_capacity(rows.len());
    for row in rows {
        let schema: String = row.get(0);
        let table: String = row.get(1);
        let est_rows: i64 = row.get(2);
        let qualified = format!("{}.{}", schema, table);
        if exclude_set.contains(&qualified) || exclude_set.contains(&table) {
            continue;
        }
        tables.push(TableRef {
            schema,
            table,
            est_rows,
        });
    }
    Ok(tables)
}

// ─── COPY binary streaming ──────────────────────────────────────────────────

/// Estado compartido del progreso entre workers.
struct CopyProgress {
    done: usize,
    total: usize,
    bytes: u64,
}

async fn copy_all_tables(
    app: &AppHandle,
    source: &ConnectionProfile,
    destination: &ConnectionProfile,
    tables: Vec<TableRef>,
    workers: usize,
    history: &Arc<Mutex<CloneHistoryEntry>>,
) -> (u64, Vec<String>) {
    let total = tables.len();
    let progress = Arc::new(AsyncMutex::new(CopyProgress {
        done: 0,
        total,
        bytes: 0,
    }));
    let errors = Arc::new(AsyncMutex::new(Vec::<String>::new()));
    let semaphore = Arc::new(tokio::sync::Semaphore::new(workers));
    let mut join_set: JoinSet<()> = JoinSet::new();

    for table in tables {
        let sem = Arc::clone(&semaphore);
        let prog = Arc::clone(&progress);
        let errs = Arc::clone(&errors);
        let src = source.clone();
        let dst = destination.clone();
        let app_clone = app.clone();
        let history_clone = Arc::clone(history);

        join_set.spawn(async move {
            let _permit = match sem.acquire_owned().await {
                Ok(p) => p,
                Err(_) => return,
            };

            let label = format!("{}.{}", table.schema, table.table);
            let result = copy_one_table(&src, &dst, &table.schema, &table.table).await;

            let mut p = prog.lock().await;
            p.done += 1;
            let done = p.done;
            let total = p.total;
            match result {
                Ok(bytes) => {
                    p.bytes += bytes;
                    let pct_overall = 35 + (done * 55 / total.max(1)) as u8;
                    let mb = bytes as f64 / 1_048_576.0;
                    let rows = if table.est_rows > 0 {
                        format!("  (~{} rows)", table.est_rows)
                    } else {
                        String::new()
                    };
                    let msg = format!(
                        "  [{:3}%] {}/{}  {}  {:.1} MB{}",
                        done * 100 / total.max(1),
                        done,
                        total,
                        label,
                        mb,
                        rows
                    );
                    emit_log(&app_clone, &msg);
                    if let Ok(mut entry) = history_clone.lock() {
                        entry.add_log(msg);
                    }
                    emit_progress(
                        &app_clone,
                        CloneProgress::new(
                            "copying",
                            pct_overall,
                            &format!("Copying {}/{}: {}", done, total, label),
                        ),
                    );
                }
                Err(e) => {
                    let mut es = errs.lock().await;
                    es.push(format!("{}: {}", label, e));
                    let msg = format!("  [ERROR] {}: {}", label, e);
                    emit_log(&app_clone, &msg);
                    if let Ok(mut entry) = history_clone.lock() {
                        entry.add_log(msg);
                    }
                }
            }
        });
    }

    while join_set.join_next().await.is_some() {}

    let final_bytes = progress.lock().await.bytes;
    let final_errors = std::mem::take(&mut *errors.lock().await);
    (final_bytes, final_errors)
}

/// Copia una tabla del origen al destino vía COPY binary streaming.
///
/// El stream del origen (`CopyOutStream`) emite `Bytes` chunks; los reenviamos
/// directamente al sink del destino (`CopyInSink`) sin materializar la tabla
/// completa en RAM ni en disco.
async fn copy_one_table(
    source: &ConnectionProfile,
    destination: &ConnectionProfile,
    schema: &str,
    table: &str,
) -> Result<u64, String> {
    let qualified = format!("\"{}\".\"{}\"", schema, table);
    let copy_out_sql = format!("COPY {} TO STDOUT (FORMAT binary)", qualified);
    let copy_in_sql = format!("COPY {} FROM STDIN (FORMAT binary)", qualified);

    let src_client = connect(source)
        .await
        .map_err(|e| format!("source connect: {}", e))?;
    let dst_client = connect(destination)
        .await
        .map_err(|e| format!("destination connect: {}", e))?;

    // Apply COPY-tuned settings on the destination session.
    dst_client
        .batch_execute(COPY_SESSION_SETTINGS)
        .await
        .map_err(|e| format!("destination settings: {}", e))?;

    let out_stream = src_client
        .copy_out(&copy_out_sql)
        .await
        .map_err(|e| format!("COPY OUT begin: {}", e))?;

    let sink = dst_client
        .copy_in::<_, Bytes>(&copy_in_sql)
        .await
        .map_err(|e| format!("COPY IN begin: {}", e))?;
    tokio::pin!(sink);

    let mut total: u64 = 0;
    let mut stream = out_stream
        .map_err(|e| format!("COPY OUT stream: {}", e))
        .boxed();

    while let Some(chunk_result) = stream.next().await {
        let chunk: Bytes = chunk_result?;
        total += chunk.len() as u64;
        sink.send(chunk)
            .await
            .map_err(|e| format!("COPY IN send: {}", e))?;
    }

    sink.as_mut()
        .finish()
        .await
        .map_err(|e| format!("COPY IN finish: {}", e))?;

    Ok(total)
}

// ─── Sequences ──────────────────────────────────────────────────────────────

async fn reset_sequences(
    source: &ConnectionProfile,
    dest_client: &Client,
) -> Result<usize, String> {
    let src_client = connect(source).await?;
    let rows = src_client
        .query(
            "SELECT schemaname, sequencename, last_value FROM pg_sequences \
             WHERE schemaname NOT IN ('pg_catalog','information_schema')",
            &[],
        )
        .await
        .map_err(|e| format!("Failed to list sequences: {}", e))?;

    let mut count = 0_usize;
    let mut sql_buf = String::new();
    for row in rows {
        let schema: String = row.get(0);
        let seq: String = row.get(1);
        let val: Option<i64> = row.get(2);
        if let Some(v) = val {
            sql_buf.push_str(&format!(
                "SELECT setval('\"{}\".\"{}\"', {});\n",
                schema, seq, v
            ));
            count += 1;
        }
    }

    if count == 0 {
        return Ok(0);
    }

    dest_client
        .batch_execute(&sql_buf)
        .await
        .map_err(|e| format!("Failed to reset sequences: {}", e))?;
    Ok(count)
}

// ─── History commands (sin cambios) ─────────────────────────────────────────

#[tauri::command]
pub fn get_history() -> Result<Vec<CloneHistoryEntry>, String> {
    let data = load_app_data();
    Ok(data.history)
}

#[tauri::command]
pub fn get_history_entry(id: String) -> Result<Option<CloneHistoryEntry>, String> {
    let data = load_app_data();
    Ok(data.history.into_iter().find(|h| h.id == id))
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    let mut data = load_app_data();
    data.history.clear();
    save_app_data(&data)?;
    Ok(())
}

