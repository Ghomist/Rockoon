//! Install the vanilla Ballance game, and game patches (BML / BML+ / new Player).
//!
//! 与 BRP 导入同一套做法：起线程下载 + 解压，进度与结果用事件回传
//! （`game-install:progress` / `game-install:complete`），支持取消。
//! 原版游戏包的结构就是游戏根（Bin/Player.exe 在顶层），直接解压到目标文件夹；
//! 补丁用同一条流水线，只是目标文件夹与「是否剥掉一层目录」不同（见 start_patch_install）。

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
        let result = download_and_extract(&app2, &id2, &url, &target_dir, &flag, true, false);
        CANCEL_MAP.lock().unwrap().remove(&id2);
        let _ = app2.emit("game-install:complete", result);
    });

    Ok(id)
}

/// Install a patch (BML / BML+ / new Player) into `target_dir`.
///
/// 与安装原版游戏同一条流水线（同样的 `game-install:*` 事件与取消方式），区别：
/// - 不校验 `Bin/Player.exe`（补丁包里本来就没有）；
/// - `strip_top_level`：上游的新 Player 包外面套了一层
///   `BallancePlayer-<版本>-<变体>/`，装的时候要剥掉这层再铺进目标目录；
///   BML / BML+ 的包条目直接在游戏根，不需要剥。
///
/// 取消用 `cancel_game_install`（取消表是按任务 id 共享的）。
#[command(async)]
pub fn start_patch_install(
    app: AppHandle,
    url: String,
    target_dir: String,
    strip_top_level: bool,
) -> RcResultWith<String> {
    let id = unique_id();
    let flag = Arc::new(AtomicBool::new(false));
    CANCEL_MAP.lock().unwrap().insert(id.clone(), flag.clone());

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let result = download_and_extract(
            &app2,
            &id2,
            &url,
            &target_dir,
            &flag,
            false,
            strip_top_level,
        );
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
    require_player: bool,
    strip_top_level: bool,
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
    if let Err(e) = extract_zip(&tmp, &target, strip_top_level) {
        let _ = std::fs::remove_file(&tmp);
        return fail(id, format!("解压失败：{e}"));
    }
    let _ = std::fs::remove_file(&tmp);

    // 装原版游戏时确认一下确实是游戏（省得把空包/坏包当成安装成功）；
    // 补丁不做这个检查（补丁包里本来就没有 Bin/Player.exe）。
    if require_player {
        let player = target.join("Bin").join("Player.exe");
        if !player.exists() {
            return fail(id, "解压后没找到 Bin/Player.exe，可能不是原版游戏包");
        }
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
/// `strip_top_level` 为真时丢掉路径的第一段（上游包外层多套一层目录时用）。
fn extract_zip(archive_path: &Path, target: &Path, strip_top_level: bool) -> Result<(), RcError> {
    let file = std::fs::File::open(archive_path)?;
    let mut zip = ZipArchive::new(file)?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        // 7-Zip 在 Windows 上可能写反斜杠，统一按 / 切分
        let raw = entry.name().replace('\\', "/");

        let mut out = target.to_path_buf();
        let mut segs = raw.split('/').filter(|s| !s.is_empty() && *s != ".");
        if strip_top_level {
            segs.next();
        }
        for seg in segs {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default();
        for (name, data) in entries {
            zw.start_file(*name, opts).unwrap();
            zw.write_all(data).unwrap();
        }
        zw.finish().unwrap();
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let mut d = std::env::temp_dir();
        d.push(format!("rockoon-game-test-{tag}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 剥一层目录：上游的新 Player 包外层是 BallancePlayer-<版本>-<变体>/，
    /// 装到 Bin 目录时必须把这层丢掉，否则会变成 Bin/BallancePlayer-…/Player.exe。
    #[test]
    fn strips_top_level_directory() {
        let dir = temp_dir("strip");
        let zip_path = dir.join("player.zip");
        make_zip(
            &zip_path,
            &[
                ("BallancePlayer-0.3.9.0-vc6-x86/Player.exe", b"MZ"),
                ("BallancePlayer-0.3.9.0-vc6-x86/ConfigTool.exe", b"MZ"),
            ],
        );

        let out = dir.join("bin");
        std::fs::create_dir_all(&out).unwrap();
        extract_zip(&zip_path, &out, true).unwrap();

        assert_eq!(std::fs::read(out.join("Player.exe")).unwrap(), b"MZ");
        assert_eq!(std::fs::read(out.join("ConfigTool.exe")).unwrap(), b"MZ");
        assert!(!out.join("BallancePlayer-0.3.9.0-vc6-x86").exists());
    }

    /// 不剥目录时（BML / BML+ 的包），条目直接就在游戏根。
    #[test]
    fn keeps_top_level_when_not_stripping() {
        let dir = temp_dir("keep");
        let zip_path = dir.join("bmlplus.zip");
        make_zip(
            &zip_path,
            &[
                ("BuildingBlocks/BMLPlus.dll", b"dll"),
                ("ModLoader/Configs/BML.cfg", b"cfg"),
            ],
        );

        let out = dir.join("root");
        std::fs::create_dir_all(&out).unwrap();
        extract_zip(&zip_path, &out, false).unwrap();

        assert_eq!(
            std::fs::read(out.join("BuildingBlocks/BMLPlus.dll")).unwrap(),
            b"dll"
        );
        assert_eq!(
            std::fs::read(out.join("ModLoader/Configs/BML.cfg")).unwrap(),
            b"cfg"
        );
    }

    /// 正常包：带空格/子目录的条目都要落到对应位置。
    #[test]
    fn extracts_game_layout() {
        let dir = temp_dir("layout");
        let zip_path = dir.join("game.zip");
        make_zip(
            &zip_path,
            &[
                ("Bin/Player.exe", b"MZ"),
                ("3D Entities/Level/Level_01.NMO", b"level"),
                ("Textures/Sky/Sky_A_Back.bmp", b"sky"),
            ],
        );

        let out = dir.join("out");
        std::fs::create_dir_all(&out).unwrap();
        extract_zip(&zip_path, &out, false).unwrap();

        assert_eq!(std::fs::read(out.join("Bin/Player.exe")).unwrap(), b"MZ");
        assert_eq!(
            std::fs::read(out.join("3D Entities/Level/Level_01.NMO")).unwrap(),
            b"level"
        );
        assert_eq!(
            std::fs::read(out.join("Textures/Sky/Sky_A_Back.bmp")).unwrap(),
            b"sky"
        );
    }

    /// 7-Zip 在 Windows 下可能写成反斜杠，得归一化到同一位置。
    #[test]
    fn normalizes_backslashes() {
        let dir = temp_dir("backslash");
        let zip_path = dir.join("game.zip");
        make_zip(&zip_path, &[("Bin\\Player.exe", b"MZ")]);

        let out = dir.join("out");
        std::fs::create_dir_all(&out).unwrap();
        extract_zip(&zip_path, &out, false).unwrap();

        assert!(out.join("Bin/Player.exe").exists());
    }

    /// zip-slip：带 .. 的条目必须被拒绝，且不能写到目标目录外。
    #[test]
    fn rejects_zip_slip() {
        let dir = temp_dir("slip");
        let zip_path = dir.join("game.zip");
        make_zip(&zip_path, &[("../evil.txt", b"boom")]);

        let out = dir.join("out");
        std::fs::create_dir_all(&out).unwrap();
        let result = extract_zip(&zip_path, &out, false);

        assert!(result.is_err(), "带 .. 的条目应该直接报错");
        assert!(!dir.join("evil.txt").exists(), "不应该写到目标目录之外");
    }
}
