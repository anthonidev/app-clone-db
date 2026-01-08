mod clone;
mod command_helper;
mod connection;
mod pg_tools;
mod profiles;
mod storage;
mod types;

use clone::{clear_history, get_history, get_history_entry, start_clone};
use connection::{check_pg_tools, test_connection, test_connection_by_id};
use profiles::{
    create_profile, create_saved_operation, create_tag, delete_profile, delete_saved_operation,
    delete_tag, get_profile, get_profiles, get_saved_operations, get_tags, update_profile,
    update_tag,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Profile commands
            get_profiles,
            get_profile,
            create_profile,
            update_profile,
            delete_profile,
            // Tag commands
            get_tags,
            create_tag,
            update_tag,
            delete_tag,
            // Saved operations commands
            get_saved_operations,
            create_saved_operation,
            delete_saved_operation,
            // Connection commands
            check_pg_tools,
            test_connection,
            test_connection_by_id,
            // Clone commands
            start_clone,
            get_history,
            get_history_entry,
            clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
