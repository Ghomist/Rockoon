//! Tauri commands wrapping the BRP validate/install logic.

use crate::ballance::brp::{self, BrpInfo, BrpInstallResult};
use crate::common::exception::{RcResult, RcResultWith};
use log::info;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{command, AppHandle, Emitter};

/// Validate a BRP archive against V1-V17 without installing. Returns the parsed
/// manifest and content summary on success.
#[command]
pub fn validate_brp(archive_path: String, instance_path: String) -> RcResultWith<BrpInfo> {
    brp::validate_brp(Path::new(&archive_path), Path::new(&instance_path))
}

/// Validate then install a BRP archive into the given instance. Refuses to
/// install anything that fails validation.
#[command]
pub fn import_brp(
    archive_path: String,
    instance_path: String,
) -> RcResultWith<BrpInstallResult> {
    brp::install_brp(Path::new(&archive_path), Path::new(&instance_path))
}

// ── Cancel Map ──────────────────────────────────────────────
static CANCEL_MAP: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn register_cancel(id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    CANCEL_MAP.lock().unwrap().insert(id.to_string(), flag.clone());
    flag
}

fn unregister_cancel(id: &str) {
    CANCEL_MAP.lock().unwrap().remove(id);
}

// ── Event Payloads ──────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct BrpImportProgressPayload {
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
struct BrpImportCompletePayload {
    #[serde(rename = "id")]
    id: String,
    #[serde(rename = "success")]
    success: bool,
    #[serde(rename = "error", skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "manifest", skip_serializing_if = "Option::is_none")]
    manifest: Option<BrpInstallResult>,
}

// ── Commands ────────────────────────────────────────────────

/// Start an async BRP download + validate + install. Returns a download ID
/// immediately; progress and completion are delivered via Tauri events
/// (`brp-import:progress` / `brp-import:complete`).
#[command(async)]
pub fn start_brp_import(
    app: AppHandle,
    url: String,
    instance_path: String,
) -> RcResultWith<String> {
    let id = unique_id();
    let cancel = register_cancel(&id);

    let app2 = app.clone();
    let id2 = id.clone();

    std::thread::spawn(move || {
        run_brp_import(app2, id2, url, instance_path, cancel);
    });

    Ok(id)
}

/// Cancel an in-progress BRP import. Returns immediately; cancellation
/// is delivered via a `brp-import:complete` event with `success: false`.
#[command(async)]
pub fn cancel_brp_import(id: String) -> RcResult {
    if let Some(flag) = CANCEL_MAP.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ── Background Worker ───────────────────────────────────────

fn run_brp_import(
    app: AppHandle,
    id: String,
    url: String,
    instance_path: String,
    cancel: Arc<AtomicBool>,
) {
    let result = download_and_install(&app, &id, &url, &instance_path, &cancel);
    unregister_cancel(&id);
    let _ = app.emit("brp-import:complete", result);
}

fn download_and_install(
    app: &AppHandle,
    id: &str,
    url: &str,
    instance_path: &str,
    cancel: &Arc<AtomicBool>,
) -> BrpImportCompletePayload {
    let fail = |msg: &str| BrpImportCompletePayload {
        id: id.to_string(),
        success: false,
        error: Some(msg.to_string()),
        manifest: None,
    };

    // pick extension from URL, default to .brp
    let ext = url
        .rsplit('?')
        .next()
        .and_then(|p| p.rsplit('/').next())
        .and_then(|s| s.rsplit_once('.').map(|(_, e)| e.to_lowercase()))
        .filter(|e| matches!(e.as_str(), "brp" | "zip"))
        .unwrap_or_else(|| "brp".into());

    let mut tmp = std::env::temp_dir();
    tmp.push(format!("rockoon-brp-{}.{}", id, ext));

    // Phase: download
    let response = match ureq::get(url).call() {
        Ok(r) => r,
        Err(e) => return fail(&format!("BRP download failed: {}", e)),
    };
    let total = response
        .header("Content-Length")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let mut reader = response.into_reader();

    let mut file = match std::fs::File::create(&tmp) {
        Ok(f) => f,
        Err(e) => return fail(&format!("Cannot create temp file: {}", e)),
    };

    let mut buf = [0u8; 8192];
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return fail(&format!("Download error: {}", e));
            }
        };
        if file.write_all(&buf[..n]).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return fail("Write error");
        }
        downloaded += n as u64;

        // Cancel check
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = std::fs::remove_file(&tmp);
            return fail("Download cancelled");
        }

        // Progress emit (throttled ~100ms)
        if total > 0 && last_emit.elapsed().as_millis() >= 100 {
            let _ = app.emit(
                "brp-import:progress",
                BrpImportProgressPayload {
                    id: id.to_string(),
                    phase: "downloading".into(),
                    percent: (downloaded as f64 / total as f64 * 100.0) as u64,
                    downloaded,
                    total,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }
    drop(file);
    info!("BRP downloaded {} bytes to {}", downloaded, tmp.display());

    // Phase: importing (emit phase transition)
    let _ = app.emit(
        "brp-import:progress",
        BrpImportProgressPayload {
            id: id.to_string(),
            phase: "importing".into(),
            percent: 100,
            downloaded: total,
            total,
        },
    );

    // Cancel check before install
    if cancel.load(Ordering::Relaxed) {
        let _ = std::fs::remove_file(&tmp);
        return fail("Download cancelled");
    }

    match brp::install_brp(&tmp, Path::new(instance_path)) {
        Ok(result) => {
            let _ = std::fs::remove_file(&tmp);
            BrpImportCompletePayload {
                id: id.to_string(),
                success: true,
                error: None,
                manifest: Some(result),
            }
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            fail(&format!("Import failed: {}", e))
        }
    }
}

/// Cheap unique-ish id for temp filenames.
fn unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", nanos)
}
