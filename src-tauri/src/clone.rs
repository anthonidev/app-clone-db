use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use crate::command_helper::create_command;
use crate::connection::get_profile_by_id;
use crate::pg_tools::{
    find_pg_dump, find_pg_dump_for_server_version, find_pg_restore,
    find_pg_restore_for_server_version, find_psql, find_psql_for_server_version,
};
use crate::storage::{load_app_data, save_app_data};
use crate::types::{CloneHistoryEntry, CloneOptions, CloneProgress, CloneStatus, CloneType};

/// Get optimal number of parallel jobs based on CPU cores
fn get_parallel_jobs() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4)
        .min(8) // Cap at 8 to avoid overwhelming the database
        .max(2) // At least 2 for meaningful parallelism
}

/// Obtiene la versión mayor del servidor PostgreSQL (e.g. 17 para v17.9)
/// server_version_num devuelve e.g. 170009 -> major = 170009 / 10000 = 17
fn get_server_major_version(psql: &str, conn_str: &str, password: &str, ssl: bool) -> Option<u32> {
    let output = create_command(psql)
        .env("PGPASSWORD", password)
        .env("PGSSLMODE", if ssl { "require" } else { "prefer" })
        .args(["-d", conn_str, "-t", "-c", "SHOW server_version_num;"])
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

/// Check if two hosts are on the same machine (both local)
fn is_local_transfer(source_host: &str, dest_host: &str) -> bool {
    let local_hosts = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
    let src_local = local_hosts.iter().any(|h| source_host == *h);
    let dst_local = local_hosts.iter().any(|h| dest_host == *h);
    src_local && dst_local
}

/// Format seconds into human-readable "Xm Ys" or "Xs"
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
    let source = get_profile_by_id(&options.source_id)
        .ok_or("Source profile not found")?;
    let destination = get_profile_by_id(&options.destination_id)
        .ok_or("Destination profile not found")?;

    // Use a baseline psql to detect server version, then pick version-matched tools
    let baseline_psql = find_psql()
        .ok_or("psql not found. Please install PostgreSQL client tools.")?;

    let source_conn_str_for_version = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );

    let server_major = get_server_major_version(
        &baseline_psql,
        &source_conn_str_for_version,
        &source.password,
        source.ssl,
    );

    let (pg_dump, psql, pg_restore) = if let Some(major) = server_major {
        let dump = find_pg_dump_for_server_version(major)
            .ok_or("pg_dump not found. Please install PostgreSQL client tools.")?;
        let sql = find_psql_for_server_version(major)
            .ok_or("psql not found. Please install PostgreSQL client tools.")?;
        let restore = find_pg_restore_for_server_version(major)
            .ok_or("pg_restore not found. Please install PostgreSQL client tools.")?;
        (dump, sql, restore)
    } else {
        let dump = find_pg_dump()
            .ok_or("pg_dump not found. Please install PostgreSQL client tools.")?;
        let restore = find_pg_restore()
            .ok_or("pg_restore not found. Please install PostgreSQL client tools.")?;
        (dump, baseline_psql, restore)
    };

    // Create history entry
    let history_entry = Arc::new(Mutex::new(CloneHistoryEntry::new(
        &source,
        &destination,
        options.clone_type.clone(),
    )));
    let entry_id = history_entry.lock().unwrap().id.clone();

    // Clone for async block
    let history_clone = Arc::clone(&history_entry);
    let app_clone = app.clone();

    // Run clone in background
    tauri::async_runtime::spawn(async move {
        let result = execute_clone(
            &app_clone,
            &pg_dump,
            &psql,
            &pg_restore,
            &source,
            &destination,
            &options,
            &history_clone,
        ).await;

        // Save history
        let mut data = load_app_data();
        let mut entry = history_clone.lock().unwrap().clone();

        match result {
            Ok(_) => {
                entry.complete(CloneStatus::Success, None);
                emit_progress(&app_clone, CloneProgress::completed("Clone completed successfully!"));
            }
            Err(e) => {
                entry.complete(CloneStatus::Error, Some(e.clone()));
                emit_progress(&app_clone, CloneProgress::error(&e));
            }
        }

        data.history.insert(0, entry);
        // Keep only last 50 history entries
        data.history.truncate(50);
        let _ = save_app_data(&data);
    });

    Ok(entry_id)
}

async fn execute_clone(
    app: &AppHandle,
    pg_dump: &str,
    psql: &str,
    pg_restore: &str,
    source: &crate::types::ConnectionProfile,
    destination: &crate::types::ConnectionProfile,
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

    // Determine if this is a local or remote transfer for compression strategy
    let is_local = is_local_transfer(&source.host, &destination.host);

    // Stage 1: Preparing
    emit_progress(app, CloneProgress::new("preparing", 5, "Preparing clone operation..."));
    add_log(&format!("[INFO] Starting clone from '{}' to '{}'", source.name, destination.name));
    add_log(&format!("[INFO] Clone type: {:?}", options.clone_type));
    add_log(&format!("[INFO] Transfer mode: {}", if is_local { "local (no compression)" } else { "remote (with compression)" }));
    add_log(&format!("[INFO] Using pg_dump: {}", pg_dump));
    add_log(&format!("[INFO] Using psql: {}", psql));

    // Stage 2: Backup (if enabled)
    if options.create_backup {
        emit_progress(app, CloneProgress::new("backup", 15, "Creating backup of destination..."));
        add_log("[INFO] Creating backup of destination database...");

        // Create backup filename
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

        let backup_output = create_command(pg_dump)
            .env("PGPASSWORD", &destination.password)
            .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
            .args(["-d", &conn_str, "-f", backup_path.to_str().unwrap()])
            .output()
            .map_err(|e| format!("Failed to create backup: {}", e))?;

        if !backup_output.status.success() {
            let stderr = String::from_utf8_lossy(&backup_output.stderr);
            add_log(&format!("[WARNING] Backup warning: {}", stderr));
        } else {
            add_log(&format!("[SUCCESS] Backup created: {}", backup_path.display()));
        }
    }

    // Stage 3: Clean destination (if enabled)
    if options.clean_destination {
        let conn_str = format!(
            "host={} port={} dbname={} user={}",
            destination.host, destination.port, destination.database, destination.user
        );

        // For data-only mode, use TRUNCATE to preserve table structure
        // For structure/both modes, use DROP to remove everything
        let is_data_only = matches!(options.clone_type, CloneType::Data);

        if is_data_only {
            emit_progress(app, CloneProgress::new("cleaning", 25, "Truncating destination tables..."));
            add_log("[INFO] Truncating destination tables (preserving structure)...");

            // Truncate all tables in public schema (faster than DELETE, resets sequences)
            let truncate_query = r#"
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    -- Disable triggers temporarily for faster truncate
                    SET session_replication_role = 'replica';
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                    -- Re-enable triggers
                    SET session_replication_role = 'origin';
                END $$;
            "#;

            let clean_output = create_command(psql)
                .env("PGPASSWORD", &destination.password)
                .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
                .args(["-d", &conn_str, "-c", truncate_query])
                .output()
                .map_err(|e| format!("Failed to truncate destination: {}", e))?;

            if !clean_output.status.success() {
                let stderr = String::from_utf8_lossy(&clean_output.stderr);
                add_log(&format!("[WARNING] Truncate warning: {}", stderr));
            } else {
                add_log("[SUCCESS] Destination tables truncated");
            }
        } else {
            emit_progress(app, CloneProgress::new("cleaning", 25, "Cleaning destination database..."));
            add_log("[INFO] Dropping and recreating public schema (removes tables, types, functions, etc.)...");

            // Drop and recreate the entire public schema to remove all objects:
            // tables, types (ENUMs), functions, sequences, views, triggers, etc.
            let drop_query = "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;";

            let clean_output = create_command(psql)
                .env("PGPASSWORD", &destination.password)
                .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
                .args(["-d", &conn_str, "-c", drop_query])
                .output()
                .map_err(|e| format!("Failed to clean destination: {}", e))?;

            if !clean_output.status.success() {
                let stderr = String::from_utf8_lossy(&clean_output.stderr);
                add_log(&format!("[WARNING] Clean warning: {}", stderr));
            } else {
                add_log("[SUCCESS] Destination schema dropped and recreated");
            }
        }
    }

    // Stage 4: Dump source
    let parallel_jobs = get_parallel_jobs();
    let dump_start = Instant::now();
    emit_progress(app, CloneProgress::new("dumping", 35, "Dumping source database..."));

    let source_conn_str = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );

    let dest_conn_str = format!(
        "host={} port={} dbname={} user={}",
        destination.host, destination.port, destination.database, destination.user
    );

    // Directory format (-Fd) enables parallel dump AND parallel restore.
    // Plain format is only needed for data-only mode (pg_restore --data-only needs existing tables).
    let use_directory_format = !matches!(options.clone_type, CloneType::Data);

    if use_directory_format {
        add_log(&format!("[INFO] Using directory format with {} parallel jobs for dump & restore", parallel_jobs));
    } else {
        add_log("[INFO] Using plain SQL format for data-only clone...");
    }

    let mut dump_args = vec!["-d".to_string(), source_conn_str];

    if use_directory_format {
        // Directory format: enables parallel dump (-j) and parallel restore (-j)
        dump_args.push("-Fd".to_string());
        dump_args.push("-j".to_string());
        dump_args.push(parallel_jobs.to_string());
        // Compression strategy: skip for local (saves CPU), use for remote (saves bandwidth)
        if is_local {
            dump_args.push("-Z".to_string());
            dump_args.push("0".to_string());
        } else {
            // Fast LZ4 compression: much less CPU than gzip, good compression ratio
            // Falls back to gzip level 3 if pg_dump doesn't support lz4 (< v16)
            dump_args.push("-Z".to_string());
            dump_args.push("lz4:1".to_string());
        }
    } else {
        dump_args.push("-Fp".to_string());
    }

    match options.clone_type {
        CloneType::Structure => {
            dump_args.push("--schema-only".to_string());
            add_log("[INFO] Dumping schema only");
        }
        CloneType::Data => {
            dump_args.push("--data-only".to_string());
            dump_args.push("--disable-triggers".to_string());
            add_log("[INFO] Dumping data only");
        }
        CloneType::Both => {
            add_log("[INFO] Dumping schema and data");
        }
    }

    for table in &options.exclude_tables {
        dump_args.push("--exclude-table".to_string());
        dump_args.push(table.clone());
        add_log(&format!("[INFO] Excluding table: {}", table));
    }

    // For directory format, dump_path is a directory; for plain, it's a file
    let dump_path = if use_directory_format {
        let dir = std::env::temp_dir().join(format!("pg_clone_{}", uuid::Uuid::new_v4()));
        // pg_dump -Fd creates the directory itself, it must NOT exist beforehand
        dir
    } else {
        std::env::temp_dir().join(format!("pg_clone_{}.sql", uuid::Uuid::new_v4()))
    };

    dump_args.push("-f".to_string());
    dump_args.push(dump_path.to_str().unwrap().to_string());

    let mut dump_output = create_command(pg_dump)
        .env("PGPASSWORD", &source.password)
        .env("PGSSLMODE", if source.ssl { "require" } else { "prefer" })
        .args(&dump_args)
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to dump source: {}", e))?;

    // If lz4 compression failed (pg_dump < 16), fallback to gzip
    if !dump_output.status.success() && !is_local && use_directory_format {
        let stderr = String::from_utf8_lossy(&dump_output.stderr);
        if stderr.to_lowercase().contains("lz4") || stderr.to_lowercase().contains("compression") {
            add_log("[WARNING] LZ4 compression not supported, falling back to gzip...");
            let _ = cleanup_dump_path(&dump_path, true);

            // Replace lz4:1 with gzip level 3 in args
            if let Some(pos) = dump_args.iter().position(|a| a == "lz4:1") {
                dump_args[pos] = "3".to_string();
            }

            dump_output = create_command(pg_dump)
                .env("PGPASSWORD", &source.password)
                .env("PGSSLMODE", if source.ssl { "require" } else { "prefer" })
                .args(&dump_args)
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to dump source: {}", e))?;
        }
    }

    if !dump_output.status.success() {
        let stderr = String::from_utf8_lossy(&dump_output.stderr);
        add_log(&format!("[ERROR] Dump failed: {}", stderr));
        let _ = cleanup_dump_path(&dump_path, use_directory_format);
        return Err(format!("Failed to dump source database: {}", stderr));
    }

    let dump_duration = dump_start.elapsed();
    add_log(&format!("[SUCCESS] Source database dumped in {}", format_duration_human(dump_duration.as_secs_f64())));

    // Get dump size
    if use_directory_format {
        if let Ok(size) = dir_size(&dump_path) {
            let size_mb = size as f64 / 1024.0 / 1024.0;
            add_log(&format!("[INFO] Dump size: {:.2} MB", size_mb));
        }
    } else if let Ok(metadata) = std::fs::metadata(&dump_path) {
        let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;
        add_log(&format!("[INFO] Dump file size: {:.2} MB", size_mb));
    }

    // Stage 5: Apply performance tuning on destination before restore
    emit_progress(app, CloneProgress::new("tuning", 55, "Tuning destination for fast restore..."));
    add_log("[INFO] Applying performance settings on destination...");

    let perf_query = r#"
        SET synchronous_commit = off;
        SET work_mem = '256MB';
        SET maintenance_work_mem = '1GB';
    "#;

    let _ = create_command(psql)
        .env("PGPASSWORD", &destination.password)
        .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
        .args(["-d", &dest_conn_str, "-c", perf_query])
        .output();

    // Stage 6: Restore to destination
    let restore_start = Instant::now();

    if use_directory_format {
        emit_progress(app, CloneProgress::new("restoring", 60, &format!("Restoring with {} parallel jobs...", parallel_jobs)));
        add_log(&format!("[INFO] Restoring with pg_restore ({} parallel jobs, no owner/privileges)...", parallel_jobs));

        let mut restore_args = vec![
            "-d".to_string(),
            dest_conn_str.clone(),
            "-Fd".to_string(),
            "-j".to_string(),
            parallel_jobs.to_string(),
            "--no-owner".to_string(),
            "--no-privileges".to_string(),
            "--disable-triggers".to_string(),
        ];

        // For structure-only, skip data; schema is fast anyway
        if matches!(options.clone_type, CloneType::Structure) {
            restore_args.push("--schema-only".to_string());
        }

        restore_args.push(dump_path.to_str().unwrap().to_string());

        let restore_process = create_command(pg_restore)
            .env("PGPASSWORD", &destination.password)
            .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
            .args(&restore_args)
            .stderr(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start restore: {}", e))?;

        let output = restore_process
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for restore: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stderr_lower = stderr.to_lowercase();

            // Count actual pg_restore errors (not warnings or ignored-error summaries)
            let error_lines: Vec<&str> = stderr.lines()
                .filter(|line| {
                    let lower = line.to_lowercase();
                    lower.contains("pg_restore: error:")
                })
                .collect();

            // Check if all errors are non-fatal (e.g. missing extensions from cloud providers)
            let non_fatal_patterns = [
                "extension",
                "comment on extension",
            ];
            let all_non_fatal = !error_lines.is_empty() && error_lines.iter().all(|line| {
                let lower = line.to_lowercase();
                non_fatal_patterns.iter().any(|pat| lower.contains(pat))
            });

            if !error_lines.is_empty() && !all_non_fatal {
                let _ = cleanup_dump_path(&dump_path, true);
                add_log(&format!("[ERROR] Restore errors: {}", stderr));
                return Err(format!("Failed to restore to destination: {}", stderr));
            } else if !stderr.is_empty() {
                // Count warnings in any locale (warning, precaución, aviso, etc.)
                let warning_count = error_lines.len()
                    + stderr_lower.matches("warning").count()
                    + stderr_lower.matches("precaución").count()
                    + stderr_lower.matches("aviso").count();
                if warning_count > 0 {
                    add_log(&format!("[WARNING] Restore completed with {} non-fatal issues (e.g. missing extensions)", warning_count));
                    for line in &error_lines {
                        add_log(&format!("[WARNING] {}", line.trim()));
                    }
                }
            }
        }
    } else {
        // Plain SQL format for data-only
        emit_progress(app, CloneProgress::new("restoring", 60, "Restoring data..."));
        add_log("[INFO] Restoring with psql (optimized settings)...");

        let optimized_path = std::env::temp_dir().join(format!("pg_clone_optimized_{}.sql", uuid::Uuid::new_v4()));

        let perf_settings = r#"-- Performance optimizations for faster restore
SET synchronous_commit = off;
SET work_mem = '256MB';
SET maintenance_work_mem = '1GB';
SET max_parallel_workers_per_gather = 0;
SET session_replication_role = 'replica';
BEGIN;

"#;

        let dump_content = std::fs::read_to_string(&dump_path)
            .map_err(|e| format!("Failed to read dump file: {}", e))?;

        let reset_settings = r#"

COMMIT;
-- Reset settings
SET session_replication_role = 'origin';
SET synchronous_commit = on;
"#;

        let optimized_content = format!("{}{}{}", perf_settings, dump_content, reset_settings);
        std::fs::write(&optimized_path, optimized_content)
            .map_err(|e| format!("Failed to write optimized script: {}", e))?;

        let restore_process = create_command(psql)
            .env("PGPASSWORD", &destination.password)
            .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
            .args(["-d", &dest_conn_str, "-f", optimized_path.to_str().unwrap()])
            .stderr(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start restore: {}", e))?;

        let output = restore_process
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for restore: {}", e))?;

        let _ = std::fs::remove_file(&optimized_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("ERROR") {
                let _ = cleanup_dump_path(&dump_path, false);
                add_log(&format!("[ERROR] Restore errors: {}", stderr));
                return Err(format!("Failed to restore to destination: {}", stderr));
            } else if !stderr.is_empty() {
                add_log(&format!("[WARNING] Restore warnings: {}", stderr));
            }
        }
    }

    // Clean up dump
    let _ = cleanup_dump_path(&dump_path, use_directory_format);

    let restore_duration = restore_start.elapsed();
    add_log(&format!("[SUCCESS] Database restored in {}", format_duration_human(restore_duration.as_secs_f64())));

    // Stage 7: Verify
    emit_progress(app, CloneProgress::new("verifying", 90, "Verifying clone..."));
    add_log("[INFO] Verifying clone...");

    // Quick verification - count tables
    let verify_query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';";

    let verify_output = create_command(psql)
        .env("PGPASSWORD", &destination.password)
        .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
        .args(["-d", &dest_conn_str, "-t", "-c", verify_query])
        .output()
        .map_err(|e| format!("Failed to verify: {}", e))?;

    let table_count = String::from_utf8_lossy(&verify_output.stdout)
        .trim()
        .parse::<i32>()
        .unwrap_or(0);

    add_log(&format!("[SUCCESS] Verification complete. Tables in destination: {}", table_count));

    // Final summary
    let total_duration = total_start.elapsed();
    add_log(&format!("[SUCCESS] Clone completed in {}", format_duration_human(total_duration.as_secs_f64())));
    add_log(&format!(
        "[INFO] Breakdown - Dump: {} | Restore: {} | Total: {}",
        format_duration_human(dump_duration.as_secs_f64()),
        format_duration_human(restore_duration.as_secs_f64()),
        format_duration_human(total_duration.as_secs_f64()),
    ));

    Ok(())
}

/// Recursively calculate directory size in bytes
fn dir_size(path: &std::path::Path) -> Result<u64, std::io::Error> {
    let mut total = 0;
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                total += dir_size(&path)?;
            } else {
                total += entry.metadata()?.len();
            }
        }
    }
    Ok(total)
}

/// Clean up dump path (file or directory)
fn cleanup_dump_path(path: &std::path::Path, is_directory: bool) -> Result<(), std::io::Error> {
    if is_directory {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

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
