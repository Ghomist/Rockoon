mod ballance;
mod commands;
mod common;

use tauri::{AppHandle, Builder, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_singleton_window(app);
        }))
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::log,
            commands::app::hide_window,
            commands::app::show_window,
            commands::app::toggle_window,
            commands::app::open_devtools,
            commands::fs::open_in_explorer,
            commands::fs::open,
            commands::fs::exists,
            commands::fs::size,
            commands::fs::list,
            commands::fs::list_dirs,
            commands::fs::copy,
            commands::fs::mkdir,
            commands::fs::delete,
            commands::fs::disable,
            commands::fs::enable,
            commands::fs::unzip,
            commands::fs::get_common_dirs,
            commands::fs::install_rockoon_mod,
            commands::fs::download_file,
            commands::process::execute,
            commands::process::kill,
            commands::process::check,
            commands::ballance::read_options,
            commands::ballance::save_options,
            commands::ballance::read_launch_config,
            commands::ballance::save_launch_config,
            commands::ballance::read_mod_config,
            commands::ballance::save_mod_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_singleton_window(app: &AppHandle) {
    let windows = app.webview_windows();

    windows
        .values()
        .next()
        .expect("Sorry, no window found")
        .set_focus()
        .expect("Can't Bring Window to Focus");
}
