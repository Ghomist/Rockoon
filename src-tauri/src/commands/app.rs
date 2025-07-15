use crate::common::exception::RcResult;
use tauri::{command, Runtime, WebviewWindow, Window};

#[command]
pub fn log(msg: String) {
    println!("{}", msg);
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
