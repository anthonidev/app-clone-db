use chrono::Utc;

use crate::storage::{load_app_data, save_app_data};
use crate::types::ConnectionProfile;

#[tauri::command]
pub fn get_profiles() -> Result<Vec<ConnectionProfile>, String> {
    let data = load_app_data();
    Ok(data.profiles)
}

#[tauri::command]
pub fn get_profile(id: String) -> Result<Option<ConnectionProfile>, String> {
    let data = load_app_data();
    Ok(data.profiles.into_iter().find(|p| p.id == id))
}

#[tauri::command]
pub fn create_profile(
    name: String,
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
    ssl: bool,
) -> Result<ConnectionProfile, String> {
    let mut data = load_app_data();

    let profile = ConnectionProfile::new(name, host, port, database, user, password, ssl);

    data.profiles.push(profile.clone());
    save_app_data(&data)?;

    Ok(profile)
}

#[tauri::command]
pub fn update_profile(
    id: String,
    name: String,
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
    ssl: bool,
) -> Result<ConnectionProfile, String> {
    let mut data = load_app_data();

    let profile = data
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or("Profile not found")?;

    profile.name = name;
    profile.host = host;
    profile.port = port;
    profile.database = database;
    profile.user = user;
    profile.password = password;
    profile.ssl = ssl;
    profile.updated_at = Utc::now();

    let updated = profile.clone();
    save_app_data(&data)?;

    Ok(updated)
}

#[tauri::command]
pub fn delete_profile(id: String) -> Result<(), String> {
    let mut data = load_app_data();

    let initial_len = data.profiles.len();
    data.profiles.retain(|p| p.id != id);

    if data.profiles.len() == initial_len {
        return Err("Profile not found".to_string());
    }

    save_app_data(&data)?;
    Ok(())
}
