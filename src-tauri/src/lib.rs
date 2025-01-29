mod app;
mod ballance;
mod fs;
mod process;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            fs::delete,
            process::execute,
            process::kill,
            process::check,
            ballance::read_options,
            ballance::save_options,
            ballance::read_launch_config,
            ballance::save_launch_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
