mod ballance;
mod commands;
mod common;

use tauri::{AppHandle, Builder, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

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
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Register the rockoon:// URL scheme in the Windows registry.
            #[cfg(desktop)]
            {
                let _ = app.deep_link().register_all();
            }
            Ok(())
        })
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
            commands::fs::remove_dir,
            commands::fs::disable,
            commands::fs::enable,
            commands::fs::rename,
            commands::fs::unzip,
            commands::fs::get_common_dirs,
            commands::fs::get_temp_dir,
            commands::fs::install_rockoon_mod,
            commands::fs::write_file,
            commands::fs::read_text_file,
            commands::fs::read_file,
            commands::fs::write_text_file,
            commands::fs::analyze_skybox_files,
            commands::fs::convert_texture,
            commands::process::execute,
            commands::process::kill,
            commands::process::check,
            commands::game::start_game_install,
            commands::game::start_patch_install,
            commands::game::cancel_game_install,
            commands::ballance::read_options,
            commands::ballance::save_options,
            commands::ballance::read_launch_config,
            commands::ballance::save_launch_config,
            commands::ballance::read_mod_config,
            commands::ballance::save_mod_config,
            commands::brp::validate_brp,
            commands::brp::import_brp,
            commands::brp::start_brp_import,
            commands::brp::cancel_brp_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 用户从下载站点「一键安装」时，浏览器会再拉一次本应用（带 rockoon:// 参数），
/// 被单实例插件拦住并把参数转到已有窗口——这里要做的就是把窗口提到最前，
/// 否则它常常就叠在浏览器后面，用户不知道下载有没有开始。
fn show_singleton_window(app: &AppHandle) {
    let Some(window) = app.webview_windows().values().next().cloned() else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    // Windows 前台窗口锁可能拒绝抢焦点：稍等确认一下，没抢到就闪任务栏兜底
    std::thread::sleep(std::time::Duration::from_millis(120));
    if !window.is_focused().unwrap_or(true) {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}
