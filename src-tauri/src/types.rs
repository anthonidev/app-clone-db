use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String, // Formato hex: #RRGGBB
}

impl Tag {
    pub fn new(name: String, color: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            color,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    #[serde(rename = "tagId")]
    pub tag_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
}

impl ConnectionProfile {
    pub fn new(
        name: String,
        host: String,
        port: u16,
        database: String,
        user: String,
        password: String,
        ssl: bool,
        tag_id: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            host,
            port,
            database,
            user,
            password,
            ssl,
            tag_id,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn connection_url(&self) -> String {
        let ssl_param = if self.ssl { "?sslmode=require" } else { "" };
        format!(
            "postgresql://{}:{}@{}:{}/{}{}",
            self.user, self.password, self.host, self.port, self.database, ssl_param
        )
    }

    pub fn env_vars(&self) -> Vec<(String, String)> {
        let mut vars = vec![
            ("PGHOST".to_string(), self.host.clone()),
            ("PGPORT".to_string(), self.port.to_string()),
            ("PGDATABASE".to_string(), self.database.clone()),
            ("PGUSER".to_string(), self.user.clone()),
            ("PGPASSWORD".to_string(), self.password.clone()),
        ];
        if self.ssl {
            vars.push(("PGSSLMODE".to_string(), "require".to_string()));
        }
        vars
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub schema: String,
    #[serde(rename = "rowCount")]
    pub row_count: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub tables: Vec<TableInfo>,
    #[serde(rename = "totalSize")]
    pub total_size: i64,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloneType {
    Structure,
    Data,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneOptions {
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "destinationId")]
    pub destination_id: String,
    #[serde(rename = "cleanDestination")]
    pub clean_destination: bool,
    #[serde(rename = "createBackup")]
    pub create_backup: bool,
    #[serde(rename = "cloneType")]
    pub clone_type: CloneType,
    #[serde(rename = "excludeTables")]
    pub exclude_tables: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneProgress {
    pub stage: String,
    pub progress: u8,
    pub message: String,
    #[serde(rename = "isComplete")]
    pub is_complete: bool,
    #[serde(rename = "isError")]
    pub is_error: bool,
}

impl CloneProgress {
    pub fn new(stage: &str, progress: u8, message: &str) -> Self {
        Self {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
            is_complete: false,
            is_error: false,
        }
    }

    pub fn completed(message: &str) -> Self {
        Self {
            stage: "completed".to_string(),
            progress: 100,
            message: message.to_string(),
            is_complete: true,
            is_error: false,
        }
    }

    pub fn error(message: &str) -> Self {
        Self {
            stage: "error".to_string(),
            progress: 0,
            message: message.to_string(),
            is_complete: true,
            is_error: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloneStatus {
    Success,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneHistoryEntry {
    pub id: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceName")]
    pub source_name: String,
    #[serde(rename = "destinationId")]
    pub destination_id: String,
    #[serde(rename = "destinationName")]
    pub destination_name: String,
    #[serde(rename = "cloneType")]
    pub clone_type: CloneType,
    pub status: CloneStatus,
    #[serde(rename = "startedAt")]
    pub started_at: DateTime<Utc>,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<DateTime<Utc>>,
    pub duration: Option<i64>,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
    pub logs: Vec<String>,
}

impl CloneHistoryEntry {
    pub fn new(
        source: &ConnectionProfile,
        destination: &ConnectionProfile,
        clone_type: CloneType,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            source_id: source.id.clone(),
            source_name: source.name.clone(),
            destination_id: destination.id.clone(),
            destination_name: destination.name.clone(),
            clone_type,
            status: CloneStatus::Success,
            started_at: Utc::now(),
            completed_at: None,
            duration: None,
            error_message: None,
            logs: Vec::new(),
        }
    }

    pub fn complete(&mut self, status: CloneStatus, error_message: Option<String>) {
        let now = Utc::now();
        self.completed_at = Some(now);
        self.duration = Some((now - self.started_at).num_seconds());
        self.status = status;
        self.error_message = error_message;
    }

    pub fn add_log(&mut self, log: String) {
        self.logs.push(log);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedOperation {
    pub id: String,
    pub name: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "destinationId")]
    pub destination_id: String,
    #[serde(rename = "cleanDestination")]
    pub clean_destination: bool,
    #[serde(rename = "createBackup")]
    pub create_backup: bool,
    #[serde(rename = "cloneType")]
    pub clone_type: CloneType,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

impl SavedOperation {
    pub fn new(
        name: String,
        source_id: String,
        destination_id: String,
        clean_destination: bool,
        create_backup: bool,
        clone_type: CloneType,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            source_id,
            destination_id,
            clean_destination,
            create_backup,
            clone_type,
            created_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    pub profiles: Vec<ConnectionProfile>,
    pub history: Vec<CloneHistoryEntry>,
    #[serde(default)]
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub saved_operations: Vec<SavedOperation>,
}
