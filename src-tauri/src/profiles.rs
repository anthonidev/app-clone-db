use chrono::Utc;
use serde::{Deserialize, Serialize};

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
#[allow(clippy::too_many_arguments)]
pub fn create_profile(
    name: String,
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
    ssl: bool,
    tag_id: Option<String>,
    read_only: Option<bool>,
) -> Result<ConnectionProfile, String> {
    let mut data = load_app_data();

    let profile = ConnectionProfile::new(
        name,
        host,
        port,
        database,
        user,
        password,
        ssl,
        tag_id,
        read_only.unwrap_or(false),
    );

    data.profiles.push(profile.clone());
    save_app_data(&data)?;

    Ok(profile)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    read_only: Option<bool>,
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
    profile.read_only = read_only.unwrap_or(false);
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

// ─── Export / Import config ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigBundle {
    pub version: u32,
    #[serde(rename = "exportedAt")]
    pub exported_at: chrono::DateTime<chrono::Utc>,
    pub profiles: Vec<ConnectionProfile>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPreview {
    #[serde(rename = "newProfiles")]
    pub new_profiles: Vec<String>,
    #[serde(rename = "replacedProfiles")]
    pub replaced_profiles: Vec<String>,
    #[serde(rename = "newTags")]
    pub new_tags: Vec<String>,
    #[serde(rename = "replacedTags")]
    pub replaced_tags: Vec<String>,
    #[serde(rename = "totalProfiles")]
    pub total_profiles: usize,
    #[serde(rename = "totalTags")]
    pub total_tags: usize,
}

const CONFIG_VERSION: u32 = 1;

#[tauri::command]
pub fn export_config() -> Result<String, String> {
    let data = load_app_data();
    let bundle = ConfigBundle {
        version: CONFIG_VERSION,
        exported_at: Utc::now(),
        profiles: data.profiles,
        tags: data.tags,
    };
    serde_json::to_string_pretty(&bundle).map_err(|e| format!("Failed to serialize: {}", e))
}

/// Genera un preview de qué cambiaría sin modificar nada. El frontend lo usa
/// para mostrar el modal de confirmación.
#[tauri::command]
pub fn preview_import_config(json: String) -> Result<ImportPreview, String> {
    let bundle: ConfigBundle =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    if bundle.version != CONFIG_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {})",
            bundle.version, CONFIG_VERSION
        ));
    }

    let data = load_app_data();
    let existing_profile_names: std::collections::HashSet<String> =
        data.profiles.iter().map(|p| p.name.clone()).collect();
    let existing_tag_names: std::collections::HashSet<String> =
        data.tags.iter().map(|t| t.name.clone()).collect();

    let mut new_profiles = Vec::new();
    let mut replaced_profiles = Vec::new();
    for p in &bundle.profiles {
        if existing_profile_names.contains(&p.name) {
            replaced_profiles.push(p.name.clone());
        } else {
            new_profiles.push(p.name.clone());
        }
    }

    let mut new_tags = Vec::new();
    let mut replaced_tags = Vec::new();
    for t in &bundle.tags {
        if existing_tag_names.contains(&t.name) {
            replaced_tags.push(t.name.clone());
        } else {
            new_tags.push(t.name.clone());
        }
    }

    Ok(ImportPreview {
        new_profiles,
        replaced_profiles,
        new_tags,
        replaced_tags,
        total_profiles: bundle.profiles.len(),
        total_tags: bundle.tags.len(),
    })
}

/// Aplica el import: conserva los del archivo y borra los duplicados por nombre.
///
/// Estrategia de duplicados (por nombre):
///   - Profile/tag con nombre existente localmente → se reemplaza (el del archivo gana)
///   - Profile/tag con nombre nuevo → se añade
///   - Profile/tag local sin coincidencia en archivo → se preserva intacto
///
/// Si un profile importado apunta a un tag_id que no existe (ni en el bundle ni
/// en los tags locales conservados), se nulea tag_id para evitar referencias rotas.
#[tauri::command]
pub fn import_config(json: String) -> Result<ImportPreview, String> {
    let bundle: ConfigBundle =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    if bundle.version != CONFIG_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {})",
            bundle.version, CONFIG_VERSION
        ));
    }

    let mut data = load_app_data();

    let local_profile_names: std::collections::HashSet<String> =
        data.profiles.iter().map(|p| p.name.clone()).collect();
    let local_tag_names: std::collections::HashSet<String> =
        data.tags.iter().map(|t| t.name.clone()).collect();
    let import_profile_names: std::collections::HashSet<String> =
        bundle.profiles.iter().map(|p| p.name.clone()).collect();
    let import_tag_names: std::collections::HashSet<String> =
        bundle.tags.iter().map(|t| t.name.clone()).collect();

    let mut new_profiles = Vec::new();
    let mut replaced_profiles = Vec::new();
    for p in &bundle.profiles {
        if local_profile_names.contains(&p.name) {
            replaced_profiles.push(p.name.clone());
        } else {
            new_profiles.push(p.name.clone());
        }
    }
    let mut new_tags = Vec::new();
    let mut replaced_tags = Vec::new();
    for t in &bundle.tags {
        if local_tag_names.contains(&t.name) {
            replaced_tags.push(t.name.clone());
        } else {
            new_tags.push(t.name.clone());
        }
    }

    // Tags: quitar los locales con nombre colisionado, añadir los del bundle.
    data.tags.retain(|t| !import_tag_names.contains(&t.name));
    data.tags.extend(bundle.tags.iter().cloned());

    // Profiles: idem.
    data.profiles
        .retain(|p| !import_profile_names.contains(&p.name));

    // Conjunto de tag_ids válidos tras el merge (bundle + locales conservados).
    let valid_tag_ids: std::collections::HashSet<String> =
        data.tags.iter().map(|t| t.id.clone()).collect();
    for p in &bundle.profiles {
        let mut profile = p.clone();
        if let Some(tag_id) = &profile.tag_id {
            if !valid_tag_ids.contains(tag_id) {
                profile.tag_id = None;
            }
        }
        data.profiles.push(profile);
    }

    save_app_data(&data)?;

    Ok(ImportPreview {
        new_profiles,
        replaced_profiles,
        new_tags,
        replaced_tags,
        total_profiles: bundle.profiles.len(),
        total_tags: bundle.tags.len(),
    })
}
