//! BRP (Ballance Resource Package) support — see BRP.md for the format spec.
//!
//! Implements V1-V17 validation and per-category installation. A BRP archive is
//! a standard ZIP with two root entries: `manifest.json` and `content/`.

use crate::common::exception::{RcError, RcResultWith};
use log::info;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

/// vanilla sky direction suffixes — Sky_X_{?}.bmp, X is literal
const SKY_DIRECTIONS: &[&str] = &["Back", "Down", "Front", "Left", "Right"];

/// All categories defined by BRP spec §4
const SUPPORTED_CATEGORIES: &[&str] = &[
    "map",
    "bmod",
    "bmodp",
    "sound",
    "sky",
    "texture",
    "x-patch",
];

/// Parsed `manifest.json`. Field names mirror the BRP spec (snake_case) — this
/// struct deserializes from the spec JSON and serializes to the frontend as-is.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BrpManifest {
    pub manifest_version: i64,
    pub category: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub authors: Option<Vec<String>>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub dependencies: Option<Vec<String>>,
}

impl BrpManifest {
    // author/author display lives on the TS side; the struct is plain data.
}

/// Result of a successful validation: the parsed manifest plus a content summary.
/// `camelCase` to follow the codebase convention for internal API types.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrpInfo {
    pub manifest: BrpManifest,
    /// First-level entries inside `content/` (file or directory names).
    pub content_entries: Vec<String>,
    /// All files inside `content/`, as forward-slash relative paths.
    pub content_files: Vec<String>,
}

/// Result of a successful install.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrpInstallResult {
    pub manifest: BrpManifest,
    /// Absolute installed file paths on disk.
    pub installed_paths: Vec<String>,
    /// Human-readable target (e.g. `ModLoader/Maps/`).
    pub target_description: String,
}

fn v_err(msg: impl Into<String>) -> RcError {
    RcError::Other(msg.into())
}

/// Open the archive and run the full V1-V17 validation suite against it.
/// `instance_path` is required for V13 (sound) and V16 (texture), which check
/// the content filenames against the vanilla game directory.
pub fn validate_brp(
    archive_path: &Path,
    instance_path: &Path,
) -> RcResultWith<BrpInfo> {
    info!(
        "Validating BRP {:?} against instance {:?}",
        archive_path, instance_path
    );

    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;

    // Collect all entry names (ZIP spec mandates forward slashes).
    let mut all_entries: Vec<String> = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let entry = archive.by_index(i)?;
        all_entries.push(entry.name().to_string());
    }

    // V7: no path traversal
    for n in &all_entries {
        if n.starts_with('/') || n.contains("..") {
            return Err(v_err(format!("V7: 包含非法路径：{}", n)));
        }
    }

    // V1: manifest.json file at root
    let manifest_is_dir = all_entries.iter().any(|n| n.starts_with("manifest.json/"));
    if manifest_is_dir {
        return Err(v_err("V1: manifest.json 是目录而非文件"));
    }
    let has_manifest_file = all_entries.iter().any(|n| n == "manifest.json");
    if !has_manifest_file {
        return Err(v_err("V1: 根目录下不存在 manifest.json"));
    }

    // V5: content/ directory exists
    let has_content = all_entries
        .iter()
        .any(|n| n == "content/" || n.starts_with("content/"));
    if !has_content {
        return Err(v_err("V5: 根目录下不存在 content/ 目录"));
    }

    // V6: root has ONLY manifest.json + content
    let mut top_level: HashSet<String> = HashSet::new();
    for n in &all_entries {
        let first = n.split('/').next().unwrap_or("");
        if !first.is_empty() {
            top_level.insert(first.to_string());
        }
    }
    if top_level.len() != 2
        || !top_level.contains("manifest.json")
        || !top_level.contains("content")
    {
        let extras: Vec<_> = top_level.iter().cloned().collect();
        return Err(v_err(format!(
            "V6: 根目录下包含 manifest.json/content/ 以外的条目：{:?}",
            extras
        )));
    }

    // V2/V3/V4/V17: parse manifest.json
    let manifest = read_manifest(&mut archive)?;
    if manifest.manifest_version != 1 {
        return Err(v_err(format!(
            "V3: manifest_version 必须为 1，实际为 {}",
            manifest.manifest_version
        )));
    }
    if manifest.category.is_empty()
        || !SUPPORTED_CATEGORIES.contains(&manifest.category.as_str())
    {
        return Err(v_err(format!("V4: 不支持的 category：{}", manifest.category)));
    }
    if let Some(deps) = &manifest.dependencies {
        if deps.iter().any(|s| s.is_empty()) {
            return Err(v_err("V17: dependencies 中包含空字符串"));
        }
    }

    // Collect files under content/ (relative paths, forward slashes)
    let mut content_files: Vec<String> = Vec::new();
    for n in &all_entries {
        if let Some(rest) = n.strip_prefix("content/") {
            if !rest.is_empty() && !rest.ends_with('/') {
                content_files.push(rest.to_string());
            }
        }
    }

    // V8: content not empty
    if content_files.is_empty() {
        return Err(v_err("V8: content/ 目录为空"));
    }

    // Compute distinct first-level entries (files OR directories) inside content/
    let mut first_level: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for n in &all_entries {
        if let Some(rest) = n.strip_prefix("content/") {
            if rest.is_empty() {
                continue;
            }
            let first = rest.split('/').next().unwrap_or("");
            if !first.is_empty() && seen.insert(first.to_string()) {
                first_level.push(first.to_string());
            }
        }
    }

    // Category-specific checks (V9-V16)
    match manifest.category.as_str() {
        "map" => validate_map(&content_files, &first_level)?,
        "bmod" => validate_mod_like(&content_files, &first_level, &manifest, &["bmod", "zip"])?,
        "bmodp" => validate_mod_like(&content_files, &first_level, &manifest, &["bmodp", "zip"])?,
        "sound" => validate_sound(&content_files, instance_path)?,
        "sky" => validate_sky(&content_files)?,
        "texture" => validate_texture(&content_files, instance_path)?,
        "x-patch" => { /* no constraints */ }
        _ => unreachable!(),
    }

    Ok(BrpInfo {
        manifest,
        content_entries: first_level,
        content_files,
    })
}

/// V9: exactly one .nmo/.cmo file at content/ root, no subdirs.
fn validate_map(content_files: &[String], first_level: &[String]) -> Result<(), RcError> {
    if first_level.len() != 1 {
        return Err(v_err(format!(
            "V9: map 类型要求 content/ 根目录下有且仅有一个文件，实际 {} 个",
            first_level.len()
        )));
    }
    let name = &first_level[0];
    if has_path_separator(name) {
        return Err(v_err("V9: map 类型不允许子目录"));
    }
    if !matches_extension(name, &["nmo", "cmo"]) {
        return Err(v_err(format!(
            "V9: map 文件必须是 .nmo 或 .cmo，实际：{}",
            name
        )));
    }
    // ensure no nested files
    if content_files.iter().any(|f| f.contains('/')) {
        return Err(v_err("V9: map 类型不允许 content/ 下存在子目录文件"));
    }
    Ok(())
}

/// V10/V11/V12: exactly one entry; if it's a directory, name must equal manifest.name.
fn validate_mod_like(
    content_files: &[String],
    first_level: &[String],
    manifest: &BrpManifest,
    allowed_exts: &[&str],
) -> Result<(), RcError> {
    if first_level.len() != 1 {
        return Err(v_err(format!(
            "V10/V11: content/ 根目录下有且仅有一个条目，实际 {} 个",
            first_level.len()
        )));
    }
    let entry = &first_level[0];

    // Is the entry a directory? (any content_files path starts with "entry/")
    let is_dir = content_files.iter().any(|f| f.starts_with(&format!("{}/", entry)));

    if is_dir {
        // V12: name required, dir name === name
        match &manifest.name {
            Some(n) if n == entry => Ok(()),
            Some(n) => Err(v_err(format!(
                "V12: 目录名「{}」必须等于 manifest.name「{}」",
                entry, n
            ))),
            None => Err(v_err(format!(
                "V12: 目录形式要求 manifest.name 必填，且等于目录名「{}」",
                entry
            ))),
        }
    } else {
        // single file form: must be one of allowed_exts
        if !matches_extension(entry, allowed_exts) {
            return Err(v_err(format!(
                "V10/V11: 文件扩展名必须是 {:?} 之一，实际：{}",
                allowed_exts, entry
            )));
        }
        if content_files.iter().any(|f| f.contains('/')) {
            return Err(v_err("V10/V11: 单文件形式不允许 content/ 下存在子目录"));
        }
        Ok(())
    }
}

/// V13: flat .wav files, names must exist in vanilla Sounds/.
fn validate_sound(content_files: &[String], instance_path: &Path) -> Result<(), RcError> {
    if content_files.iter().any(|f| f.contains('/')) {
        return Err(v_err("V13: sound 类型 content/ 不允许子目录"));
    }
    for f in content_files {
        if !matches_extension(f, &["wav"]) {
            return Err(v_err(format!("V13: sound 类型仅允许 .wav 文件：{}", f)));
        }
    }
    // enumerate vanilla Sounds/ filenames
    let vanilla = list_vanilla_filenames(&instance_path.join("Sounds"));
    for f in content_files {
        if !vanilla.contains(f) {
            return Err(v_err(format!(
                "V13: 文件名「{}」不存在于原版 Sounds/ 中",
                f
            )));
        }
    }
    Ok(())
}

/// V14/V15: filenames match Sky_X_{Back|Down|Front|Left|Right}.bmp, all 5 present.
fn validate_sky(content_files: &[String]) -> Result<(), RcError> {
    if content_files.iter().any(|f| f.contains('/')) {
        return Err(v_err("V14: sky 类型 content/ 不允许子目录"));
    }
    let mut present: HashSet<&str> = HashSet::new();
    for f in content_files {
        // Case-sensitive suffix per spec; tolerate .bmp case via lowercase compare
        let lower = f.to_lowercase();
        if !lower.ends_with(".bmp") {
            return Err(v_err(format!("V14: sky 文件必须是 .bmp：{}", f)));
        }
        let stem = &f[..f.len() - ".bmp".len()];
        let Some(suffix) = stem.strip_prefix("Sky_X_") else {
            return Err(v_err(format!(
                "V14: sky 文件名必须形如 Sky_X_{{方向}}.bmp（字面 X）：{}",
                f
            )));
        };
        if !SKY_DIRECTIONS.contains(&suffix) {
            return Err(v_err(format!(
                "V14: sky 方向必须是 {:?} 之一，实际：{}",
                SKY_DIRECTIONS, suffix
            )));
        }
        present.insert(suffix);
    }
    for d in SKY_DIRECTIONS {
        if !present.contains(*d) {
            return Err(v_err(format!(
                "V15: sky 缺少方向贴图：Sky_X_{}.bmp",
                d
            )));
        }
    }
    Ok(())
}

/// V16: flat files, names must exist in vanilla Textures/ (excluding Sky/ subdir).
fn validate_texture(content_files: &[String], instance_path: &Path) -> Result<(), RcError> {
    if content_files.iter().any(|f| f.contains('/')) {
        return Err(v_err("V16: texture 类型 content/ 不允许子目录"));
    }
    let vanilla = list_vanilla_filenames(&instance_path.join("Textures"));
    for f in content_files {
        if !vanilla.contains(f) {
            return Err(v_err(format!(
                "V16: 文件名「{}」不存在于原版 Textures/ 中",
                f
            )));
        }
    }
    Ok(())
}

/// Install a validated BRP archive into the given instance. Re-validates first
/// to refuse installing anything non-conformant.
pub fn install_brp(
    archive_path: &Path,
    instance_path: &Path,
) -> RcResultWith<BrpInstallResult> {
    let info = validate_brp(archive_path, instance_path)?;

    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;

    let (target_dir, target_description) =
        target_for_category(&info.manifest.category, instance_path);
    fs::create_dir_all(&target_dir)?;
    info!("Installing BRP (cat={}) into {}", info.manifest.category, target_dir.display());

    let mut installed: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        if name.ends_with('/') {
            continue;
        }
        let Some(rel) = name.strip_prefix("content/") else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        let dest = target_dir.join(rel);
        // path-traversal guard (V7 enforced at validate, but re-check on disk)
        if !dest.starts_with(&target_dir) {
            return Err(v_err(format!("安装路径越界：{}", dest.display())));
        }
        if let Some(p) = dest.parent() {
            fs::create_dir_all(p)?;
        }
        let mut out = File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
        installed.push(dest.to_string_lossy().to_string());
    }

    info!(
        "BRP install complete: {} files into {}",
        installed.len(),
        target_dir.display()
    );

    Ok(BrpInstallResult {
        manifest: info.manifest,
        installed_paths: installed,
        target_description,
    })
}

/// Map a BRP category to its on-disk install target inside the game instance.
fn target_for_category(category: &str, instance: &Path) -> (PathBuf, String) {
    match category {
        "map" => (
            instance.join("ModLoader").join("Maps"),
            "ModLoader/Maps/".into(),
        ),
        "bmod" | "bmodp" => (
            instance.join("ModLoader").join("Mods"),
            "ModLoader/Mods/".into(),
        ),
        "sound" => (instance.join("Sounds"), "Sounds/".into()),
        "sky" => (
            instance.join("Textures").join("Sky"),
            "Textures/Sky/".into(),
        ),
        "texture" => (instance.join("Textures"), "Textures/".into()),
        "x-patch" => (instance.to_path_buf(), "<game root>/".into()),
        _ => unreachable!(),
    }
}

/// Parse `manifest.json` from the archive (V2).
fn read_manifest(archive: &mut ZipArchive<File>) -> Result<BrpManifest, RcError> {
    let mut entry = archive
        .by_name("manifest.json")
        .map_err(|_| v_err("V2: 无法读取 manifest.json"))?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf)?;
    serde_json::from_str::<BrpManifest>(&buf)
        .map_err(|e| v_err(format!("V2: manifest.json 不是合法 JSON：{}", e)))
}

/// Case-insensitive extension match against a list of extensions (without dot).
fn matches_extension(name: &str, exts: &[&str]) -> bool {
    let lower = name.to_lowercase();
    exts.iter().any(|e| lower.ends_with(&format!(".{}", e)))
}

fn has_path_separator(s: &str) -> bool {
    s.contains('/') || s.contains('\\')
}

/// List plain file basenames directly inside `dir` (non-recursive). Used for
/// V13 (Sounds/) and V16 (Textures/) vanilla filename checks. Returns an empty
/// set if the directory does not exist (the check will then fail every entry).
fn list_vanilla_filenames(dir: &Path) -> HashSet<String> {
    let mut out = HashSet::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        if let Ok(ft) = entry.file_type() {
            if ft.is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    out.insert(name.to_string());
                }
            }
        }
    }
    out
}
