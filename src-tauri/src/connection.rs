use std::process::Command;

use crate::pg_tools::{find_psql, check_tools_available};
use crate::storage::load_app_data;
use crate::types::{ConnectionProfile, DatabaseInfo, TableInfo};

#[tauri::command]
pub fn check_pg_tools() -> Result<bool, String> {
    Ok(check_tools_available())
}

#[tauri::command]
pub async fn test_connection(
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
    ssl: bool,
) -> Result<DatabaseInfo, String> {
    let psql = find_psql().ok_or("psql not found. Please install PostgreSQL client tools.")?;

    // Build connection string
    let conn_str = format!(
        "host={} port={} dbname={} user={}",
        host, port, database, user
    );

    // First, test basic connection and get version
    let version_output = Command::new(&psql)
        .env("PGPASSWORD", &password)
        .env("PGSSLMODE", if ssl { "require" } else { "prefer" })
        .args(["-d", &conn_str, "-t", "-c", "SELECT version();"])
        .output()
        .map_err(|e| format!("Failed to execute psql: {}", e))?;

    if !version_output.status.success() {
        let stderr = String::from_utf8_lossy(&version_output.stderr);
        return Err(format!("Connection failed: {}", stderr));
    }

    let version = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_string();

    // Get table information
    let tables_query = r#"
        SELECT
            t.table_name,
            t.table_schema,
            COALESCE(s.n_live_tup, 0)::bigint as row_count,
            COALESCE(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)), 0)::bigint as size
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname AND t.table_schema = s.schemaname
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_schema, t.table_name;
    "#;

    let tables_output = Command::new(&psql)
        .env("PGPASSWORD", &password)
        .env("PGSSLMODE", if ssl { "require" } else { "prefer" })
        .args(["-d", &conn_str, "-t", "-A", "-F", "|", "-c", tables_query])
        .output()
        .map_err(|e| format!("Failed to get table info: {}", e))?;

    let tables_str = String::from_utf8_lossy(&tables_output.stdout);
    let mut tables = Vec::new();

    for line in tables_str.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            tables.push(TableInfo {
                name: parts[0].to_string(),
                schema: parts[1].to_string(),
                row_count: parts[2].parse().unwrap_or(0),
                size: parts[3].parse().unwrap_or(0),
            });
        }
    }

    // Get total database size
    let size_output = Command::new(&psql)
        .env("PGPASSWORD", &password)
        .env("PGSSLMODE", if ssl { "require" } else { "prefer" })
        .args([
            "-d",
            &conn_str,
            "-t",
            "-c",
            &format!("SELECT pg_database_size('{}');", database),
        ])
        .output()
        .map_err(|e| format!("Failed to get database size: {}", e))?;

    let total_size: i64 = String::from_utf8_lossy(&size_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    Ok(DatabaseInfo {
        tables,
        total_size,
        version,
    })
}

#[tauri::command]
pub async fn test_connection_by_id(id: String) -> Result<DatabaseInfo, String> {
    let data = load_app_data();
    let profile = data
        .profiles
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("Profile not found")?;

    test_connection(
        profile.host,
        profile.port,
        profile.database,
        profile.user,
        profile.password,
        profile.ssl,
    )
    .await
}

pub fn get_profile_by_id(id: &str) -> Option<ConnectionProfile> {
    let data = load_app_data();
    data.profiles.into_iter().find(|p| p.id == id)
}
