mod app;
mod ballance;
mod fs;
mod process;

use tauri::{AppHandle, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_singleton_window(app);
        }))
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            app::log,
            app::hide_window,
            app::show_window,
            app::toggle_window,
            fs::exists,
            fs::size,
            fs::list,
            fs::mkdir,
            fs::delete,
            fs::disable,
            fs::enable,
            fs::unzip,
            process::execute,
            process::kill,
            process::check,
            ballance::read_options,
            ballance::save_options,
            ballance::read_launch_config,
            ballance::save_launch_config,
            ballance::read_mod_config,
            ballance::save_mod_config
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
