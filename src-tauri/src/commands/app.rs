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
        if msg.len() > 150 {
            log!(
                level,
                "[UI] Message is too long! {}",
                msg[..150].to_string()
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
    raise_window(&window);
    Ok(())
}

/// 把窗口提到最前：还原（可能最小化或藏在托盘）→ 显示 → 抢焦点。
///
/// 为什么需要：下载站用 rockoon:// 一键安装时，用户需要立刻看到进度，
/// 窗口只 show 不 focus 的话经常就叠在浏览器后面，看起来像“什么都没发生”。
/// Windows 的前台窗口锁会拒后台进程抢焦点，所以再等一拍确认一下，没抢到就闪任务栏。
pub fn raise_window<R: Runtime>(window: &Window<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    std::thread::sleep(std::time::Duration::from_millis(120));
    if !window.is_focused().unwrap_or(true) {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

#[command]
pub fn toggle_window<R: Runtime>(window: Window<R>) -> RcResult {
    let visible = window.is_visible()?;
    if visible {
        window.hide()?;
    } else {
        raise_window(&window);
    }
    Ok(())
}

#[command]
pub fn open_devtools<R: Runtime>(window: WebviewWindow<R>) -> RcResult {
    window.open_devtools();
    Ok(())
}
