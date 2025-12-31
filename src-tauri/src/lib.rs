mod clone;
mod connection;
mod pg_tools;
mod profiles;
mod storage;
mod types;

use clone::{clear_history, get_history, get_history_entry, start_clone};
use connection::{check_pg_tools, test_connection, test_connection_by_id};
use profiles::{create_profile, delete_profile, get_profile, get_profiles, update_profile};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Profile commands
            get_profiles,
            get_profile,
            create_profile,
            update_profile,
            delete_profile,
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
