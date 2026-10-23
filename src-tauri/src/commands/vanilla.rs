//! 原版游戏素材校验与恢复（3D Entities 下的 nmo：13 个关卡 + 组件）。
//!
//! - `verify_vanilla_levels`：启动游戏前比对 sha256，找出被替换 / 缺失的原版文件
//! - `restore_vanilla_levels`：用启动器内置的原版包覆盖这些文件，一键恢复原版
//!
//! 清单与内置包由 `tools/gen-vanilla-assets.ps1` 从原版游戏包生成：
//! `resources/vanilla/manifest.json`（编译时 `include_str!` 嵌进二进制，避免运行时再多一个
//! 必须能读到的文件），`resources/vanilla/vanilla-core.zip`（运行时资源，Tauri resource）。
//! 内置包不含 Textures/ 与 Sounds/ —— 材质、天空、音效走下载站，不在启动器里重复打包。

use crate::common::exception::{RcError, RcResultWith};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{command, AppHandle, Manager};

const MANIFEST: &str = include_str!("../../resources/vanilla/manifest.json");
const LEVELS_DIR: &str = "3D Entities/";

#[derive(serde::Deserialize)]
struct VanillaManifest {
    /// 相对游戏根的正斜杠路径 → sha256（小写 hex）
    files: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaFileState {
    /// 相对游戏根的路径，例如 `3D Entities/Level/Level_01.NMO`
    pub path: String,
    /// `modified` = 内容被换过；`missing` = 文件不在（或读不了）
    pub reason: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaRestoreResult {
    pub restored: usize,
    pub skipped: usize,
}

fn manifest() -> Result<VanillaManifest, RcError> {
    serde_json::from_str(MANIFEST).map_err(|e| RcError::Other(format!("原版清单解析失败：{e}")))
}

/// 清单里 `3D Entities/` 下的 nmo 条目。原版扩展名大小写混用（`.nmo` / `.NMO`），不敏感比较。
fn level_entries(manifest: &VanillaManifest) -> Vec<(&str, &str)> {
    manifest
        .files
        .iter()
        .filter(|(path, _)| {
            path.len() > LEVELS_DIR.len()
                && path[..LEVELS_DIR.len()].eq_ignore_ascii_case(LEVELS_DIR)
                && path.to_ascii_lowercase().ends_with(".nmo")
        })
        .map(|(path, hash)| (path.as_str(), hash.as_str()))
        .collect()
}

/// `root` + 清单里的相对路径；挡掉 `..` / 绝对路径（清单是自己生成的，仍然校验一次）。
fn resolve_in(root: &Path, rel: &str) -> Result<PathBuf, RcError> {
    let mut out = root.to_path_buf();
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." || seg.contains(':') {
            return Err(RcError::Other(format!("清单里有非法路径：{rel}")));
        }
        out.push(seg);
    }
    Ok(out)
}

fn sha256_file(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let mut hex = String::with_capacity(64);
    for byte in hasher.finalize() {
        let _ = write!(hex, "{byte:02x}");
    }
    Some(hex)
}

fn check_levels(root: &Path, manifest: &VanillaManifest) -> Vec<VanillaFileState> {
    let mut mismatched = Vec::new();
    for (rel, want) in level_entries(manifest) {
        let Ok(file) = resolve_in(root, rel) else {
            continue;
        };
        match sha256_file(&file) {
            Some(hash) if hash == want => {}
            Some(_) => mismatched.push(VanillaFileState {
                path: rel.to_string(),
                reason: "modified",
            }),
            None => mismatched.push(VanillaFileState {
                path: rel.to_string(),
                reason: "missing",
            }),
        }
    }
    mismatched
}

/// 校验 `3D Entities` 下的原版 nmo，返回不一致的文件（空 = 原版）。
/// 读 18MB 左右的文件做哈希，所以必须是 async 命令，不能堵主线程。
#[command(async)]
pub fn verify_vanilla_levels(instance_path: String) -> RcResultWith<Vec<VanillaFileState>> {
    let root = PathBuf::from(&instance_path);
    if !root.is_dir() {
        return Err(RcError::Other(format!(
            "不是有效的游戏目录：{instance_path}"
        )));
    }
    let manifest = manifest()?;
    let mismatched = check_levels(&root, &manifest);
    log::info!(
        "Vanilla level check: {}/{} files mismatch in {}",
        mismatched.len(),
        level_entries(&manifest).len(),
        instance_path
    );
    Ok(mismatched)
}

/// 用内置的原版包恢复 `3D Entities` 下的 nmo。
///
/// 只覆盖清单里的文件，且已经是原版的跳过；`3D Entities` 里多出来的文件（别人装的
/// 自定义关卡等）一律不动 —— 恢复的是「原版文件」，不是「清空文件夹」。
#[command(async)]
pub fn restore_vanilla_levels(
    app: AppHandle,
    instance_path: String,
) -> RcResultWith<VanillaRestoreResult> {
    let root = PathBuf::from(&instance_path);
    if !root.is_dir() {
        return Err(RcError::Other(format!(
            "不是有效的游戏目录：{instance_path}"
        )));
    }
    let zip_path = app.path().resolve(
        "resources/vanilla/vanilla-core.zip",
        BaseDirectory::Resource,
    )?;
    restore_from_zip(&root, &zip_path)
}

fn restore_from_zip(root: &Path, zip_path: &Path) -> RcResultWith<VanillaRestoreResult> {
    let manifest = manifest()?;
    let mut archive = zip::ZipArchive::new(std::fs::File::open(zip_path)?)?;

    let (mut restored, mut skipped) = (0usize, 0usize);
    for (rel, want) in level_entries(&manifest) {
        let dest = resolve_in(root, rel)?;
        if sha256_file(&dest).as_deref() == Some(want) {
            skipped += 1;
            continue;
        }
        // 内置包里的条目名就是清单里的路径（同一个目录打出来的）
        let Ok(mut entry) = archive.by_name(rel) else {
            skipped += 1;
            continue;
        };
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
        restored += 1;
    }

    log::info!(
        "Restored {} vanilla level files ({} already vanilla) in {}",
        restored,
        skipped,
        root.display()
    );
    Ok(VanillaRestoreResult { restored, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 清单本身：3D Entities 下的 nmo 数量与顶层关卡文件名
    #[test]
    fn manifest_lists_every_level_file() {
        let manifest = manifest().unwrap();
        let entries = level_entries(&manifest);
        assert_eq!(entries.len(), 51, "原版 3D Entities 里应有 51 个 nmo");
        assert!(entries
            .iter()
            .any(|(path, _)| *path == "3D Entities/Level/Level_01.NMO"));
        assert!(entries
            .iter()
            .any(|(path, _)| *path == "3D Entities/PH/P_Box.nmo"));
    }

    /// 内置包必须含全部清单文件、且内容与清单哈希一致（包和清单是同一个脚本生成的，
    /// 但凡有人只换了一个，恢复出来的就不是原版）
    #[test]
    fn builtin_zip_matches_manifest() {
        let zip_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/vanilla/vanilla-core.zip");
        let mut archive = zip::ZipArchive::new(std::fs::File::open(zip_path).unwrap()).unwrap();
        let manifest = manifest().unwrap();
        for (rel, want) in level_entries(&manifest) {
            let mut entry = archive
                .by_name(rel)
                .unwrap_or_else(|e| panic!("内置包里没有 {rel}：{e}"));
            let mut hasher = Sha256::new();
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = entry.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            let mut hex = String::new();
            for byte in hasher.finalize() {
                let _ = write!(hex, "{byte:02x}");
            }
            assert_eq!(hex, want, "内置包里的 {rel} 不是原版");
        }
    }

    /// 被改过 / 丢了 两种情况都要报出来，原版的不能报
    #[test]
    fn reports_modified_and_missing_levels() {
        let manifest = manifest().unwrap();
        let entries = level_entries(&manifest);
        let (keep, modify) = (entries[0].0, entries[1].0);

        let mut root = std::env::temp_dir();
        root.push(format!("rockoon-vanilla-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // 只造这一个文件，别的都当缺失
        let file = resolve_in(&root, keep).unwrap();
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, b"not the original file").unwrap();

        let mismatched = check_levels(&root, &manifest);
        let _ = std::fs::remove_dir_all(&root);

        let state = |path: &str| mismatched.iter().find(|s| s.path == path).map(|s| s.reason);
        assert_eq!(state(keep), Some("modified"));
        assert_eq!(state(modify), Some("missing"));
        // 清单里所有文件都不在原版状态（这个临时目录是空的），所以数量应该对得上
        assert_eq!(mismatched.len(), entries.len());
    }

    /// 端到端：把内置包铺到一个空目录 → 全部原版；改掉其中一个 → 恢复回去
    #[test]
    fn restore_brings_files_back_to_vanilla() {
        let zip_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/vanilla/vanilla-core.zip");
        let manifest = manifest().unwrap();

        let mut root = std::env::temp_dir();
        root.push(format!("rockoon-vanilla-restore-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // 第一次：目录是空的，全部写进去；第二次：都已经是原版，全部跳过
        let first = restore_from_zip(&root, &zip_path).unwrap();
        assert_eq!(first.restored, level_entries(&manifest).len());
        assert!(check_levels(&root, &manifest).is_empty());
        let second = restore_from_zip(&root, &zip_path).unwrap();
        assert_eq!(second.restored, 0);

        // 改掉一个关卡（模拟别人装的自定义关卡），恢复后必须变回原版
        let level = resolve_in(&root, "3D Entities/Level/Level_01.NMO").unwrap();
        std::fs::write(&level, b"a custom level").unwrap();
        assert_eq!(check_levels(&root, &manifest).len(), 1);

        let third = restore_from_zip(&root, &zip_path).unwrap();
        assert_eq!(third.restored, 1);
        assert!(check_levels(&root, &manifest).is_empty());

        // 原版里没有的文件不该被删
        let extra = resolve_in(&root, "3D Entities/Level/MyCustom.NMO").unwrap();
        std::fs::write(&extra, b"keep me").unwrap();
        restore_from_zip(&root, &zip_path).unwrap();
        assert!(extra.exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
