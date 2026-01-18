use std::process::Stdio;

use tauri::{AppHandle, Emitter};

use crate::command_helper::create_command;
use crate::connection::get_profile_by_id;
use crate::pg_tools::find_pg_dump;
use crate::types::SchemaProgress;

fn emit_schema_progress(app: &AppHandle, progress: SchemaProgress) {
    let _ = app.emit("schema-progress", &progress);
}

fn emit_schema_log(app: &AppHandle, log: &str) {
    let _ = app.emit("schema-log", log);
}

#[tauri::command]
pub async fn download_schema(app: AppHandle, profile_id: String) -> Result<String, String> {
    let profile = get_profile_by_id(&profile_id).ok_or("Profile not found")?;

    let pg_dump =
        find_pg_dump().ok_or("pg_dump not found. Please install PostgreSQL client tools.")?;

    let app_clone = app.clone();

    // Run in background
    let result = tauri::async_runtime::spawn(async move {
        execute_schema_download(&app_clone, &pg_dump, &profile).await
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

async fn execute_schema_download(
    app: &AppHandle,
    pg_dump: &str,
    profile: &crate::types::ConnectionProfile,
) -> Result<String, String> {
    let add_log = |msg: &str| {
        emit_schema_log(app, msg);
    };

    // Stage 1: Preparing
    emit_schema_progress(
        app,
        SchemaProgress::new("preparing", 10, "Preparing schema download..."),
    );
    add_log(&format!(
        "[INFO] Starting schema download from '{}'",
        profile.name
    ));
    add_log(&format!(
        "[INFO] Database: {}:{}/{}",
        profile.host, profile.port, profile.database
    ));

    // Stage 2: Dumping schema
    emit_schema_progress(
        app,
        SchemaProgress::new("dumping", 30, "Extracting database schema..."),
    );
    add_log("[INFO] Dumping schema only (no data)...");

    let conn_str = format!(
        "host={} port={} dbname={} user={}",
        profile.host, profile.port, profile.database, profile.user
    );

    let dump_args = vec![
        "-d".to_string(),
        conn_str,
        "--schema-only".to_string(),
        "-Fp".to_string(), // Plain format
    ];

    let dump_output = create_command(pg_dump)
        .env("PGPASSWORD", &profile.password)
        .env(
            "PGSSLMODE",
            if profile.ssl { "require" } else { "prefer" },
        )
        .args(&dump_args)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to dump schema: {}", e))?;

    if !dump_output.status.success() {
        let stderr = String::from_utf8_lossy(&dump_output.stderr);
        add_log(&format!("[ERROR] Schema dump failed: {}", stderr));
        emit_schema_progress(app, SchemaProgress::error(&format!("Dump failed: {}", stderr)));
        return Err(format!("Failed to dump schema: {}", stderr));
    }

    let schema_content = String::from_utf8_lossy(&dump_output.stdout).to_string();
    let schema_size = schema_content.len();

    add_log(&format!(
        "[SUCCESS] Schema extracted ({:.2} KB)",
        schema_size as f64 / 1024.0
    ));

    // Stage 3: Complete
    emit_schema_progress(
        app,
        SchemaProgress::completed("Schema ready for download"),
    );
    add_log("[INFO] Schema ready for download");

    Ok(schema_content)
}
