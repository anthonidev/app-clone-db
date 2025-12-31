use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::connection::get_profile_by_id;
use crate::pg_tools::{find_pg_dump, find_psql};
use crate::storage::{load_app_data, save_app_data};
use crate::types::{CloneHistoryEntry, CloneOptions, CloneProgress, CloneStatus, CloneType};

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

        let backup_output = Command::new(pg_dump)
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
        emit_progress(app, CloneProgress::new("cleaning", 25, "Cleaning destination database..."));
        add_log("[INFO] Cleaning destination database...");

        let conn_str = format!(
            "host={} port={} dbname={} user={}",
            destination.host, destination.port, destination.database, destination.user
        );

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

        let clean_output = Command::new(psql)
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

    // Stage 4: Dump source
    emit_progress(app, CloneProgress::new("dumping", 40, "Dumping source database..."));
    add_log("[INFO] Dumping source database...");

    let source_conn_str = format!(
        "host={} port={} dbname={} user={}",
        source.host, source.port, source.database, source.user
    );

    let mut dump_args = vec!["-d".to_string(), source_conn_str];

    // Add clone type options
    match options.clone_type {
        CloneType::Structure => {
            dump_args.push("--schema-only".to_string());
            add_log("[INFO] Dumping schema only");
        }
        CloneType::Data => {
            dump_args.push("--data-only".to_string());
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
    let dump_path = std::env::temp_dir().join(format!("pg_clone_{}.sql", uuid::Uuid::new_v4()));
    dump_args.push("-f".to_string());
    dump_args.push(dump_path.to_str().unwrap().to_string());

    add_log(&format!("[INFO] Running pg_dump with args: {:?}", dump_args));

    let dump_output = Command::new(pg_dump)
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

    add_log("[SUCCESS] Source database dumped successfully");

    // Get dump file size
    if let Ok(metadata) = std::fs::metadata(&dump_path) {
        add_log(&format!("[INFO] Dump file size: {} bytes", metadata.len()));
    }

    // Stage 5: Restore to destination
    emit_progress(app, CloneProgress::new("restoring", 70, "Restoring to destination..."));
    add_log("[INFO] Restoring to destination database...");

    let dest_conn_str = format!(
        "host={} port={} dbname={} user={}",
        destination.host, destination.port, destination.database, destination.user
    );

    let restore_process = Command::new(psql)
        .env("PGPASSWORD", &destination.password)
        .env("PGSSLMODE", if destination.ssl { "require" } else { "prefer" })
        .args(["-d", &dest_conn_str, "-f", dump_path.to_str().unwrap()])
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start restore: {}", e))?;

    let output = restore_process
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for restore: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&dump_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Some warnings are OK
        if stderr.contains("ERROR") {
            add_log(&format!("[ERROR] Restore errors: {}", stderr));
            return Err(format!("Failed to restore to destination: {}", stderr));
        } else {
            add_log(&format!("[WARNING] Restore warnings: {}", stderr));
        }
    }

    add_log("[SUCCESS] Database restored successfully");

    // Stage 6: Verify
    emit_progress(app, CloneProgress::new("verifying", 90, "Verifying clone..."));
    add_log("[INFO] Verifying clone...");

    // Quick verification - count tables
    let verify_query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';";

    let verify_output = Command::new(psql)
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
