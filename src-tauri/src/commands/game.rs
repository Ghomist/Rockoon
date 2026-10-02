//! Install the vanilla Ballance game from the download site.
//!
//! 与 BRP 导入同一套做法：起线程下载 + 解压，进度与结果用事件回传
//! （`game-install:progress` / `game-install:complete`），支持取消。
//! 包的结构就是游戏根（Bin/Player.exe 在顶层），所以直接解压到目标文件夹。

use crate::common::exception::{RcError, RcResult, RcResultWith};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{command, AppHandle, Emitter};
use zip::ZipArchive;

static CANCEL_MAP: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("game-{}-{}", std::process::id(), nanos)
}

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    #[serde(rename = "id")]
    id: String,
    #[serde(rename = "phase")]
    phase: String,
    #[serde(rename = "percent")]
    percent: u64,
    #[serde(rename = "downloaded")]
    downloaded: u64,
    #[serde(rename = "total")]
    total: u64,
}

#[derive(Clone, serde::Serialize)]
struct CompletePayload {
    #[serde(rename = "id")]
    id: String,
    #[serde(rename = "success")]
    success: bool,
    #[serde(rename = "error", skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "target", skip_serializing_if = "Option::is_none")]
    target: Option<String>,
}

/// Download the vanilla game archive and extract it into `target_dir`.
/// Returns a task id immediately; progress and the result arrive as events.
#[command(async)]
pub fn start_game_install(app: AppHandle, url: String, target_dir: String) -> RcResultWith<String> {
    let id = unique_id();
    let flag = Arc::new(AtomicBool::new(false));
    CANCEL_MAP.lock().unwrap().insert(id.clone(), flag.clone());

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let result = download_and_extract(&app2, &id2, &url, &target_dir, &flag);
        CANCEL_MAP.lock().unwrap().remove(&id2);
        let _ = app2.emit("game-install:complete", result);
    });

    Ok(id)
}

/// Cancel an in-progress install. Returns immediately; cancellation arrives as a
/// `game-install:complete` event with `success: false`.
#[command(async)]
pub fn cancel_game_install(id: String) -> RcResult {
    if let Some(flag) = CANCEL_MAP.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, id: &str, phase: &str, percent: u64, downloaded: u64, total: u64) {
    let _ = app.emit(
        "game-install:progress",
        ProgressPayload {
            id: id.to_string(),
            phase: phase.to_string(),
            percent,
            downloaded,
            total,
        },
    );
}

fn fail(id: &str, msg: impl Into<String>) -> CompletePayload {
    CompletePayload {
        id: id.to_string(),
        success: false,
        error: Some(msg.into()),
        target: None,
    }
}

fn download_and_extract(
    app: &AppHandle,
    id: &str,
    url: &str,
    target_dir: &str,
    cancel: &Arc<AtomicBool>,
) -> CompletePayload {
    let target = PathBuf::from(target_dir);
    if let Err(e) = std::fs::create_dir_all(&target) {
        return fail(id, format!("无法创建目标文件夹：{e}"));
    }

    let mut tmp = std::env::temp_dir();
    tmp.push(format!("rockoon-game-{id}.zip"));

    // ── 下载 ────────────────────────────────────────────────
    emit_progress(app, id, "connecting", 0, 0, 0);
    let response = match ureq::get(url).call() {
        Ok(r) => r,
        Err(e) => return fail(id, format!("连接下载站失败：{e}")),
    };
    let total = response
        .header("Content-Length")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let mut reader = response.into_reader();
    let mut file = match std::fs::File::create(&tmp) {
        Ok(f) => f,
        Err(e) => return fail(id, format!("无法创建临时文件：{e}")),
    };

    let mut buf = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return fail(id, format!("下载中断：{e}"));
            }
        };
        if file.write_all(&buf[..n]).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return fail(id, "写入临时文件失败");
        }
        downloaded += n as u64;

        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = std::fs::remove_file(&tmp);
            return fail(id, "已取消");
        }

        if last_emit.elapsed().as_millis() >= 100 {
            let percent = if total > 0 {
                (downloaded.min(total) * 100 / total).min(100)
            } else {
                0
            };
            emit_progress(app, id, "downloading", percent, downloaded, total);
            last_emit = std::time::Instant::now();
        }
    }
    drop(file);

    if total > 0 && downloaded < total {
        let _ = std::fs::remove_file(&tmp);
        return fail(id, format!("下载不完整：{downloaded}/{total} 字节"));
    }

    // ── 解压 ────────────────────────────────────────────────
    emit_progress(app, id, "importing", 100, downloaded, total);
    if let Err(e) = extract_zip(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return fail(id, format!("解压失败：{e}"));
    }
    let _ = std::fs::remove_file(&tmp);

    // 解压完确认一下确实是游戏（省得把空包/坏包当成安装成功）
    let player = target.join("Bin").join("Player.exe");
    if !player.exists() {
        return fail(id, "解压后没找到 Bin/Player.exe，可能不是原版游戏包");
    }

    let _ = app.emit(
        "game-install:progress",
        ProgressPayload {
            id: id.to_string(),
            phase: "done".to_string(),
            percent: 100,
            downloaded,
            total: downloaded,
        },
    );

    CompletePayload {
        id: id.to_string(),
        success: true,
        error: None,
        target: Some(target.to_string_lossy().to_string()),
    }
}

/// 解压到 target。逐个条目规范化路径，挡掉 zip-slip（`..` 与绝对路径）。
fn extract_zip(archive_path: &Path, target: &Path) -> Result<(), RcError> {
    let file = std::fs::File::open(archive_path)?;
    let mut zip = ZipArchive::new(file)?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        // 7-Zip 在 Windows 上可能写反斜杠，统一按 / 切分
        let raw = entry.name().replace('\\', "/");

        let mut out = target.to_path_buf();
        for seg in raw.split('/') {
            if seg.is_empty() || seg == "." {
                continue;
            }
            if seg == ".." || seg.contains(':') {
                return Err(RcError::Other(format!("压缩包含非法路径：{raw}")));
            }
            out.push(seg);
        }
        if out == target {
            continue;
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut f = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut f)?;
    }
    Ok(())
}
