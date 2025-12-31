use std::fs;
use std::path::PathBuf;

use crate::types::AppData;

const APP_DATA_FILE: &str = "db-clone-data.json";

pub fn get_app_data_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("db-clone-app").join(APP_DATA_FILE))
}

pub fn load_app_data() -> AppData {
    let Some(path) = get_app_data_path() else {
        return AppData::default();
    };

    if !path.exists() {
        return AppData::default();
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppData::default(),
    }
}

pub fn save_app_data(data: &AppData) -> Result<(), String> {
    let path = get_app_data_path().ok_or("Could not determine app data directory")?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content =
        serde_json::to_string_pretty(data).map_err(|e| format!("Failed to serialize data: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
