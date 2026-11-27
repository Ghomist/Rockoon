use crate::common::exception::{RcResult, RcResultWith};
use log::{log, log_enabled, Level};
use sha2::{Digest, Sha256};
use tauri::{command, AppHandle, Runtime, WebviewWindow, Window};

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

#[command(async)]
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

#[command(async)]
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

/// 重启启动器自己。
///
/// macOS 上自更新装完了必须自己重启：更新插件只负责把 .app 换掉（rename 新包到位），
/// 不会重启进程 —— 还在跑的还是旧的可执行文件。Windows 那边不用（NSIS 会自己关掉旧进程再起新的）。
#[command]
pub fn restart_app<R: Runtime>(app: AppHandle<R>) -> RcResult {
    // 这个函数不会返回：进程被替换掉了
    app.restart()
}

/// 读剪贴板里 BVM 交过来的地图码（地图太大、深链放不下时 BVM 改放剪贴板，链接里只带校验码）。
///
/// 校验码是地图码 SHA-256 的前 16 位十六进制：对得上才返回内容，对不上（剪贴板被换掉了）或者剪贴板里不是文字
/// 都返回 None。在 Rust 里核对，免得把剪贴板里不相干的大段内容传到前端。
///
/// 核对上了就把剪贴板清空：那是 BVM 临时放进去的一大段地图码，留着只会占地方（剪贴板历史里也一样）。
#[command(async)]
pub fn read_clipboard_map(hash: String) -> RcResultWith<Option<String>> {
    let Ok(mut clipboard) = arboard::Clipboard::new() else {
        return Ok(None);
    };
    let Ok(text) = clipboard.get_text() else {
        return Ok(None);
    };
    let text = text.trim();
    let hex: String = Sha256::digest(text.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect();
    if !hex.eq_ignore_ascii_case(hash.trim()) {
        return Ok(None);
    }
    let code = text.to_string();
    let _ = clipboard.clear();
    Ok(Some(code))
}
