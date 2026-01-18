use std::process::Stdio;

use tauri::{AppHandle, Emitter};

use crate::command_helper::create_command;
use crate::connection::get_profile_by_id;
use crate::pg_tools::find_pg_dump;
use crate::types::{SchemaExportOptions, SchemaProgress};

fn emit_schema_progress(app: &AppHandle, progress: SchemaProgress) {
    let _ = app.emit("schema-progress", &progress);
}

fn emit_schema_log(app: &AppHandle, log: &str) {
    let _ = app.emit("schema-log", log);
}

#[tauri::command]
pub async fn download_schema(
    app: AppHandle,
    options: SchemaExportOptions,
) -> Result<String, String> {
    let profile = get_profile_by_id(&options.profile_id).ok_or("Profile not found")?;

    let pg_dump =
        find_pg_dump().ok_or("pg_dump not found. Please install PostgreSQL client tools.")?;

    let app_clone = app.clone();
    let options_clone = options.clone();

    // Run in background
    let result = tauri::async_runtime::spawn(async move {
        execute_schema_download(&app_clone, &pg_dump, &profile, &options_clone).await
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    result
}

async fn execute_schema_download(
    app: &AppHandle,
    pg_dump: &str,
    profile: &crate::types::ConnectionProfile,
    options: &SchemaExportOptions,
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

    // Log options being used
    let has_advanced_options = !options.schemas.is_empty()
        || !options.tables.is_empty()
        || !options.include_comments
        || !options.include_indexes
        || !options.include_constraints
        || !options.include_triggers
        || !options.include_sequences
        || !options.include_types
        || !options.include_functions
        || !options.include_views;

    if has_advanced_options {
        add_log("[INFO] Using advanced export options");
        if !options.schemas.is_empty() {
            add_log(&format!("[INFO] Schemas: {}", options.schemas.join(", ")));
        }
        if !options.tables.is_empty() {
            add_log(&format!("[INFO] Tables: {}", options.tables.join(", ")));
        }
    }

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

    let mut dump_args = vec![
        "-d".to_string(),
        conn_str,
        "--schema-only".to_string(),
        "-Fp".to_string(), // Plain format
    ];

    // Add schema filters
    if !options.schemas.is_empty() {
        for schema in &options.schemas {
            dump_args.push("--schema".to_string());
            dump_args.push(schema.clone());
        }
    }

    // Add table filters
    if !options.tables.is_empty() {
        for table in &options.tables {
            dump_args.push("--table".to_string());
            dump_args.push(table.clone());
        }
    }

    // Handle exclusions based on options
    // Note: pg_dump doesn't have direct flags for each of these,
    // so we use section exclusions where possible

    // Exclude triggers if not wanted
    if !options.include_triggers {
        dump_args.push("--disable-triggers".to_string());
        add_log("[INFO] Excluding triggers");
    }

    // For comments, indexes, constraints - we'll filter the output post-processing
    // since pg_dump doesn't have direct exclusion flags for these

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

    let mut schema_content = String::from_utf8_lossy(&dump_output.stdout).to_string();

    // Post-process to filter out unwanted elements
    emit_schema_progress(
        app,
        SchemaProgress::new("processing", 70, "Processing schema..."),
    );

    schema_content = filter_schema_content(&schema_content, options, &add_log);

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

fn filter_schema_content<F>(content: &str, options: &SchemaExportOptions, add_log: &F) -> String
where
    F: Fn(&str),
{
    let mut result = String::new();
    let mut skip_until_semicolon = false;
    let mut current_block = String::new();
    let mut in_multiline_statement = false;
    let mut excluded_count = 0;

    for line in content.lines() {
        let trimmed = line.trim();

        // Track multiline statements
        if !in_multiline_statement {
            current_block.clear();
        }
        current_block.push_str(line);
        current_block.push('\n');

        // Check if we're in a multiline statement
        if trimmed.ends_with(';') || trimmed.is_empty() || trimmed.starts_with("--") {
            in_multiline_statement = false;
        } else if trimmed.contains('(') && !trimmed.contains(')') {
            in_multiline_statement = true;
        }

        // Skip logic
        if skip_until_semicolon {
            if trimmed.ends_with(';') {
                skip_until_semicolon = false;
            }
            continue;
        }

        // Filter COMMENT statements
        if !options.include_comments && trimmed.starts_with("COMMENT ON") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter CREATE INDEX statements
        if !options.include_indexes && trimmed.starts_with("CREATE INDEX") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        if !options.include_indexes && trimmed.starts_with("CREATE UNIQUE INDEX") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter constraint statements (ALTER TABLE ... ADD CONSTRAINT)
        if !options.include_constraints && trimmed.starts_with("ALTER TABLE") && trimmed.contains("ADD CONSTRAINT") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter FOREIGN KEY constraints in ALTER statements
        if !options.include_constraints && trimmed.contains("FOREIGN KEY") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter CREATE SEQUENCE statements
        if !options.include_sequences && trimmed.starts_with("CREATE SEQUENCE") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter ALTER SEQUENCE statements
        if !options.include_sequences && trimmed.starts_with("ALTER SEQUENCE") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter setval for sequences
        if !options.include_sequences && trimmed.contains("setval(") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter CREATE TYPE statements
        if !options.include_types && trimmed.starts_with("CREATE TYPE") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter CREATE FUNCTION/PROCEDURE statements
        if !options.include_functions
            && (trimmed.starts_with("CREATE FUNCTION")
                || trimmed.starts_with("CREATE OR REPLACE FUNCTION")
                || trimmed.starts_with("CREATE PROCEDURE")
                || trimmed.starts_with("CREATE OR REPLACE PROCEDURE"))
        {
            // Functions can span many lines, skip until $$ ... $$ ; pattern
            skip_until_semicolon = true;
            excluded_count += 1;
            continue;
        }

        // Filter CREATE VIEW statements
        if !options.include_views
            && (trimmed.starts_with("CREATE VIEW") || trimmed.starts_with("CREATE OR REPLACE VIEW"))
        {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        // Filter CREATE TRIGGER statements
        if !options.include_triggers && trimmed.starts_with("CREATE TRIGGER") {
            if !trimmed.ends_with(';') {
                skip_until_semicolon = true;
            }
            excluded_count += 1;
            continue;
        }

        result.push_str(line);
        result.push('\n');
    }

    if excluded_count > 0 {
        add_log(&format!("[INFO] Filtered out {} statements", excluded_count));
    }

    result
}
