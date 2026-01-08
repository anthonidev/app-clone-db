use chrono::Utc;

use crate::storage::{load_app_data, save_app_data};
use crate::types::{CloneType, ConnectionProfile, SavedOperation, Tag};

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
    tag_id: Option<String>,
) -> Result<ConnectionProfile, String> {
    let mut data = load_app_data();

    let profile = ConnectionProfile::new(name, host, port, database, user, password, ssl, tag_id);

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
    tag_id: Option<String>,
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
    profile.tag_id = tag_id;
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

// Tag commands

#[tauri::command]
pub fn get_tags() -> Result<Vec<Tag>, String> {
    let data = load_app_data();
    Ok(data.tags)
}

#[tauri::command]
pub fn create_tag(name: String, color: String) -> Result<Tag, String> {
    let mut data = load_app_data();

    // Validate color format
    if !color.starts_with('#') || color.len() != 7 {
        return Err("Color must be in hex format: #RRGGBB".to_string());
    }

    let tag = Tag::new(name, color);
    data.tags.push(tag.clone());
    save_app_data(&data)?;

    Ok(tag)
}

#[tauri::command]
pub fn update_tag(id: String, name: String, color: String) -> Result<Tag, String> {
    let mut data = load_app_data();

    // Validate color format
    if !color.starts_with('#') || color.len() != 7 {
        return Err("Color must be in hex format: #RRGGBB".to_string());
    }

    let tag = data
        .tags
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("Tag not found")?;

    tag.name = name;
    tag.color = color;

    let updated = tag.clone();
    save_app_data(&data)?;

    Ok(updated)
}

#[tauri::command]
pub fn delete_tag(id: String) -> Result<(), String> {
    let mut data = load_app_data();

    let initial_len = data.tags.len();
    data.tags.retain(|t| t.id != id);

    if data.tags.len() == initial_len {
        return Err("Tag not found".to_string());
    }

    // Remove tag_id from profiles that reference this tag
    for profile in data.profiles.iter_mut() {
        if profile.tag_id.as_ref() == Some(&id) {
            profile.tag_id = None;
        }
    }

    save_app_data(&data)?;
    Ok(())
}

// Saved Operations commands

#[tauri::command]
pub fn get_saved_operations() -> Result<Vec<SavedOperation>, String> {
    let data = load_app_data();
    Ok(data.saved_operations)
}

#[tauri::command]
pub fn create_saved_operation(
    name: String,
    source_id: String,
    destination_id: String,
    clean_destination: bool,
    create_backup: bool,
    clone_type: CloneType,
) -> Result<SavedOperation, String> {
    let mut data = load_app_data();

    let operation = SavedOperation::new(
        name,
        source_id,
        destination_id,
        clean_destination,
        create_backup,
        clone_type,
    );

    data.saved_operations.push(operation.clone());
    save_app_data(&data)?;

    Ok(operation)
}

#[tauri::command]
pub fn delete_saved_operation(id: String) -> Result<(), String> {
    let mut data = load_app_data();

    let initial_len = data.saved_operations.len();
    data.saved_operations.retain(|o| o.id != id);

    if data.saved_operations.len() == initial_len {
        return Err("Saved operation not found".to_string());
    }

    save_app_data(&data)?;
    Ok(())
}
