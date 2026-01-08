use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use crate::command_helper::create_command;
use crate::connection::get_profile_by_id;
use crate::pg_tools::{find_pg_dump, find_pg_restore, find_psql};
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

    let pg_dump = find_pg_dump().ok_or("pg_dump not found. Please install PostgreSQL client tools.")?;
    let psql = find_psql().ok_or("psql not found. Please install PostgreSQL client tools.")?;
    let pg_restore = find_pg_restore().ok_or("pg_restore not found. Please install PostgreSQL client tools.")?;

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
    let add_log = |msg: &str| {
        emit_log(app, msg);
        if let Ok(mut entry) = history.lock() {
            entry.add_log(msg.to_string());
        }
    };

    // Stage 1: Preparing
    emit_progress(app, CloneProgress::new("preparing", 5, "Preparing clone operation..."));
    add_log(&format!("[INFO] Starting clone from '{}' to '{}'", source.name, destination.name));
    add_log(&format!("[INFO] Clone type: {:?}", options.clone_type));

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
            add_log("[INFO] Dropping destination tables...");

            // Drop all tables in public schema
            let drop_query = r#"
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            "#;

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
                add_log("[SUCCESS] Destination database cleaned");
            }
        }
    }

    // Stage 4: Dump source
    let parallel_jobs = get_parallel_jobs();
    let dump_start = Instant::now();
    emit_progress(app, CloneProgress::new("dumping", 40, "Dumping source database..."));

    let source_conn_str = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );

    let dest_conn_str = format!(
        "host={} port={} dbname={} user={}",
        destination.host, destination.port, destination.database, destination.user
    );

    // For data-only mode, we use plain SQL format since pg_restore with --data-only
    // requires tables to exist. For structure and both, we use custom format for parallel restore.
    let use_custom_format = !matches!(options.clone_type, CloneType::Data);

    if use_custom_format {
        add_log("[INFO] Using custom format with parallel restore...");
        add_log(&format!("[INFO] Will use {} parallel jobs for restore", parallel_jobs));
    } else {
        add_log("[INFO] Using plain SQL format for data-only clone...");
    }

    let mut dump_args = vec!["-d".to_string(), source_conn_str];

    if use_custom_format {
        // Custom format for parallel restore
        dump_args.push("-Fc".to_string());
        dump_args.push("-Z".to_string());
        dump_args.push("1".to_string()); // Light compression (faster for remote)
    } else {
        // Plain format for data-only (will be piped directly)
        dump_args.push("-Fp".to_string()); // Plain format
    }

    // Add clone type options
    match options.clone_type {
        CloneType::Structure => {
            dump_args.push("--schema-only".to_string());
            add_log("[INFO] Dumping schema only");
        }
        CloneType::Data => {
            dump_args.push("--data-only".to_string());
            dump_args.push("--disable-triggers".to_string()); // Faster data restore
            add_log("[INFO] Dumping data only");
        }
        CloneType::Both => {
            add_log("[INFO] Dumping schema and data");
        }
    }

    // Add excluded tables
    for table in &options.exclude_tables {
        dump_args.push("--exclude-table".to_string());
        dump_args.push(table.clone());
        add_log(&format!("[INFO] Excluding table: {}", table));
    }

    // Create temp file for dump
    let dump_ext = if use_custom_format { "dump" } else { "sql" };
    let dump_path = std::env::temp_dir().join(format!("pg_clone_{}.{}", uuid::Uuid::new_v4(), dump_ext));
    dump_args.push("-f".to_string());
    dump_args.push(dump_path.to_str().unwrap().to_string());

    let dump_output = create_command(pg_dump)
        .env("PGPASSWORD", &source.password)
        .env("PGSSLMODE", if source.ssl { "require" } else { "prefer" })
        .args(&dump_args)
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to dump source: {}", e))?;

    if !dump_output.status.success() {
        let stderr = String::from_utf8_lossy(&dump_output.stderr);
        add_log(&format!("[ERROR] Dump failed: {}", stderr));
        return Err(format!("Failed to dump source database: {}", stderr));
    }

    let dump_duration = dump_start.elapsed();
    add_log(&format!("[SUCCESS] Source database dumped in {:.1}s", dump_duration.as_secs_f64()));

    // Get dump file size
    if let Ok(metadata) = std::fs::metadata(&dump_path) {
        let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;
        add_log(&format!("[INFO] Dump file size: {:.2} MB", size_mb));
    }

    // Stage 5: Restore to destination
    let restore_start = Instant::now();

    if use_custom_format {
        // Use pg_restore with parallel jobs for custom format
        emit_progress(app, CloneProgress::new("restoring", 70, &format!("Restoring with {} parallel jobs...", parallel_jobs)));
        add_log(&format!("[INFO] Restoring with pg_restore ({} parallel jobs)...", parallel_jobs));

        let restore_args = vec![
            "-d".to_string(),
            dest_conn_str.clone(),
            "-j".to_string(),
            parallel_jobs.to_string(),
            "--no-owner".to_string(),
            "--no-privileges".to_string(),
            "-v".to_string(),
            dump_path.to_str().unwrap().to_string(),
        ];

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
            if stderr.to_lowercase().contains("error") && !stderr.contains("pg_restore: warning") {
                let _ = std::fs::remove_file(&dump_path);
                add_log(&format!("[ERROR] Restore errors: {}", stderr));
                return Err(format!("Failed to restore to destination: {}", stderr));
            } else if !stderr.is_empty() {
                let warning_count = stderr.matches("warning").count();
                if warning_count > 0 {
                    add_log(&format!("[WARNING] Restore completed with {} warnings", warning_count));
                }
            }
        }
    } else {
        // Use psql for plain SQL format (data-only)
        emit_progress(app, CloneProgress::new("restoring", 70, "Restoring data..."));
        add_log("[INFO] Restoring with psql (optimized settings)...");

        // Create optimized restore script with performance settings
        let optimized_path = std::env::temp_dir().join(format!("pg_clone_optimized_{}.sql", uuid::Uuid::new_v4()));

        // Performance settings to prepend
        let perf_settings = r#"-- Performance optimizations for faster restore
SET synchronous_commit = off;
SET work_mem = '256MB';
SET maintenance_work_mem = '512MB';
SET max_parallel_workers_per_gather = 0;
SET session_replication_role = 'replica';

"#;

        // Read dump content and prepend settings
        let dump_content = std::fs::read_to_string(&dump_path)
            .map_err(|e| format!("Failed to read dump file: {}", e))?;

        // Add reset at the end
        let reset_settings = r#"

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

        // Clean up optimized file
        let _ = std::fs::remove_file(&optimized_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("ERROR") {
                let _ = std::fs::remove_file(&dump_path);
                add_log(&format!("[ERROR] Restore errors: {}", stderr));
                return Err(format!("Failed to restore to destination: {}", stderr));
            } else if !stderr.is_empty() {
                add_log(&format!("[WARNING] Restore warnings: {}", stderr));
            }
        }
    }

    // Clean up temp file
    let _ = std::fs::remove_file(&dump_path);

    let restore_duration = restore_start.elapsed();
    add_log(&format!("[SUCCESS] Database restored in {:.1}s", restore_duration.as_secs_f64()));

    // Stage 6: Verify
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

    Ok(())
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
