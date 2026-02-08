use crate::common::exception::RcResult;
use log::{log, log_enabled, Level};
use tauri::{command, Runtime, WebviewWindow, Window};

#[command]
pub fn log(level: String, msg: String) -> RcResult {
    let level = match level.as_str() {
        "error" => Level::Error,
        "warn" => Level::Warn,
        "info" => Level::Info,
        "debug" => Level::Debug,
        "trace" => Level::Trace,
        _ => Level::Info,
    };
    if log_enabled!(level) {
        if msg.len() > 100 {
            log!(
                level,
                "[UI] Message is too long! {}",
                msg[..100].to_string()
            );
        } else {
            log!(level, "[UI] {}", msg);
        }
    }
    Ok(())
}

#[command]
pub fn hide_window<R: Runtime>(window: Window<R>) -> RcResult {
    window.hide()?;
    Ok(())
}

#[command]
pub fn show_window<R: Runtime>(window: Window<R>) -> RcResult {
    window.show()?;
    Ok(())
}

#[command]
pub fn toggle_window<R: Runtime>(window: Window<R>) -> RcResult {
    let visible = window.is_visible()?;
    if visible {
        window.hide()?;
    } else {
        window.show()?;
    }
    Ok(())
}

#[command]
pub fn open_devtools<R: Runtime>(window: WebviewWindow<R>) -> RcResult {
    window.open_devtools();
    Ok(())
}
