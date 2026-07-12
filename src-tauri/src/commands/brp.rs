//! Tauri commands wrapping the BRP validate/install logic.

use crate::ballance::brp::{self, BrpInfo, BrpInstallResult};
use crate::common::exception::{RcError, RcResultWith};
use log::info;
use std::path::Path;
use tauri::command;

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

/// Download a BRP file from `url` into a temp path, then validate + install.
/// The downloaded file is deleted afterwards.
#[command]
pub fn import_brp_from_url(
    url: String,
    instance_path: String,
) -> RcResultWith<BrpInstallResult> {
    info!("BRP import from URL: {} -> {}", url, instance_path);

    // pick extension from URL, default to .brp
    let ext = url
        .rsplit('?')
        .next()
        .and_then(|path_part| {
            let last_seg = path_part.rsplit('/').next()?;
            last_seg.rsplit_once('.').map(|(_, e)| e.to_lowercase())
        })
        .filter(|e| matches!(e.as_str(), "brp" | "zip"));
    let ext = ext.unwrap_or_else(|| "brp".into());

    let mut tmp = std::env::temp_dir();
    tmp.push(format!("rockoon-brp-{}.{}", unique_id(), ext));

    // download synchronously via ureq (mirrors existing download_file command)
    let response = ureq::get(&url).call().map_err(|e| {
        RcError::Other(format!("BRP 下载失败：{}", e))
    })?;
    let mut reader = response.into_reader();
    {
        let mut file = std::fs::File::create(&tmp)?;
        std::io::copy(&mut reader, &mut file)?;
    }
    info!("BRP downloaded to {}", tmp.display());

    // validate + install; clean up regardless of outcome
    let result = brp::install_brp(&tmp, Path::new(&instance_path));
    let _ = std::fs::remove_file(&tmp);
    result
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
