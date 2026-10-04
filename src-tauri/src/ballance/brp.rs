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

/// 原版天空盒的五个方位后缀
const SKY_DIRECTIONS: &[&str] = &["Back", "Down", "Front", "Left", "Right"];

/// sky 包里 `Sky_X_<方位>.bmp` 的 `X` 是**占位符**（不是字面文件名）：安装到某一关时
/// 会被替换成那一关的字母（原版：1→L 2→E 3→A 4/13→F 5→C 6→H 7→D 8→G 9→K 10→B 11→J 12→I）。
/// 保持 `X` 不替换 = 只给自制地图用的那个槽位（旧站命名惯例）。
const SKY_PLACEHOLDER: &str = "X";

/// 可接受的替换字母：原版的 A–L（M 是社区“分离第 13 关”补丁用的）+ 占位符本身
const SKY_LETTERS: &[&str] = &[
    "X", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
];

/// All categories defined by BRP spec §4
/// （`mod` 是合并后的模组类别：一个包里可以同时带 .bmod 与 .bmodp 两份产物；
/// `bmod`/`bmodp` 保留兼容，历史资源包里仍是这两个类别）
const SUPPORTED_CATEGORIES: &[&str] = &[
    "map",
    "mod",
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
    /// mod 类别：这次实际装进去的产物（bmod / bmodp）；其它类别为空
    pub installed_mod_formats: Vec<String>,
    /// mod 类别：实例里最终会加载 mod 的那个加载器（bml / bmlp / none）
    pub mod_loader: String,
    /// mod 类别：包里没有与实例加载器匹配的产物，装的是另一种（前端据此提醒用户）
    pub mod_variant_mismatch: bool,
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
        "mod" => validate_mod(&content_files, &first_level, &manifest)?,
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

/// mod（合并后的模组类别）：`content/` 根下 1~2 个条目，可以同时带 .bmod（老 BML）与
/// .bmodp（BML+）。两种加载器各自只认自己的扩展名（BML+ 只看 .zip/.bmodp，老 BML 只看
/// .bmod），所以两份放一个包里是安全的，站点的依赖也只需要写一个资源 id。
fn validate_mod(
    content_files: &[String],
    first_level: &[String],
    manifest: &BrpManifest,
) -> Result<(), RcError> {
    if first_level.is_empty() || first_level.len() > 2 {
        return Err(v_err(format!(
            "V10/V11: mod 类型要求 content/ 根目录下 1~2 个条目，实际 {} 个",
            first_level.len()
        )));
    }

    let mut seen: Vec<&str> = Vec::new();
    for entry in first_level {
        // 目录形式（沿用 bmod/bmodp 的老规则）：V12 name 必填且等于目录名
        if content_files.iter().any(|f| f.starts_with(&format!("{}/", entry))) {
            match &manifest.name {
                Some(n) if n == entry => {}
                Some(n) => {
                    return Err(v_err(format!(
                        "V12: 目录名「{}」必须等于 manifest.name「{}」",
                        entry, n
                    )))
                }
                None => {
                    return Err(v_err(format!(
                        "V12: 目录形式要求 manifest.name 必填，且等于目录名「{}」",
                        entry
                    )))
                }
            }
            continue;
        }

        let lower = entry.to_lowercase();
        let ext = if lower.ends_with(".bmodp") || lower.ends_with(".bmodp.zip") {
            "bmodp"
        } else if lower.ends_with(".bmod") || lower.ends_with(".bmod.zip") {
            "bmod"
        } else if lower.ends_with(".zip") {
            // 普通 zip：作者直接传 BRP 包时认不出归属，不参与「同格式只能一份」的判定
            continue;
        } else {
            return Err(v_err(format!(
                "V10/V11: mod 类型条目必须是 .bmod/.bmodp/.zip，实际：{}",
                entry
            )));
        };
        if seen.contains(&ext) {
            return Err(v_err(format!(
                "V10/V11: mod 类型不允许两份同为 {} 的产物",
                ext
            )));
        }
        seen.push(ext);
    }

    Ok(())
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
                "V14: sky 文件名必须形如 Sky_X_{{方向}}.bmp（X 为占位符，安装时替换成目标关卡字母）：{}",
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
/// 安装 BRP 到实例目录。
///
/// `sky_letter`：sky 类别专用于替换 `Sky_X_*` 里那个占位符 X 的关卡字母
/// （`None` 或 `"X"` = 不替换，保留给自制地图槽位）。非 sky 类别忽略此参数。
pub fn install_brp(
    archive_path: &Path,
    instance_path: &Path,
    sky_letter: Option<&str>,
) -> RcResultWith<BrpInstallResult> {
    let info = validate_brp(archive_path, instance_path)?;

    // 先定下要替换成的字母：非法值直接拒绝，避免装出一堆没人会读的文件
    let sky_letter = match sky_letter {
        Some(letter) if info.manifest.category == "sky" => {
            let letter = letter.trim().to_uppercase();
            if !SKY_LETTERS.contains(&letter.as_str()) {
                return Err(v_err(format!(
                    "天空盒目标关卡字母非法：{}（应为 A–L 或 M）",
                    letter
                )));
            }
            if letter == SKY_PLACEHOLDER {
                None
            } else {
                Some(letter)
            }
        }
        _ => None,
    };

    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;

    let (target_dir, target_description) =
        target_for_category(&info.manifest.category, instance_path);
    fs::create_dir_all(&target_dir)?;
    info!("Installing BRP (cat={}) into {}", info.manifest.category, target_dir.display());

    // mod：一个包里可能同时带 .bmod 与 .bmodp，按实例里实际会加载的那个加载器选一份装；
    // 另一份对当前加载器没意义（BML+ 不看 .bmod，老 BML 不看 .bmodp）。
    let mod_loader = detect_mod_loader(instance_path);
    let available_formats = mod_artifacts(&info);
    let mut mod_formats: Vec<String> = Vec::new();
    let mut mod_variant_mismatch = false;
    if info.manifest.category == "mod" {
        let prefer = match mod_loader {
            "bml" => Some("bmod"),
            "bmlp" => Some("bmodp"),
            _ => None,
        };
        match prefer {
            // 包里正好有对应产物：只装那一份
            Some(p) if available_formats.iter().any(|f| f == p) => mod_formats.push(p.to_string()),
            // 没有任何带归属的产物（比如只有一个普通 zip）：认不出属于谁，照装且不报不匹配
            Some(_) if available_formats.is_empty() => {}
            // 装了加载器但包里没这份产物：把现有的装上，并在结果里标记不匹配
            Some(_) => {
                mod_formats = available_formats.clone();
                mod_variant_mismatch = true;
            }
            // 没检测到加载器：两份都放进去，之后装哪种加载器都能用
            None => mod_formats = available_formats.clone(),
        }
    }

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
        // mod：只装与实例加载器匹配的那份产物（非 mod 产物或目录形式照旧安装）
        if !mod_formats.is_empty() {
            if let Some(ext) = mod_ext_of(rel) {
                if !mod_formats.iter().any(|f| f == ext) {
                    continue;
                }
            }
        }
        // sky：把占位符 X 换成目标关卡的字母（只动文件名首缀，路径其它部分不动）
        let rel = match &sky_letter {
            Some(letter) if rel.starts_with("Sky_X_") => {
                format!("Sky_{}_{}", letter, &rel["Sky_X_".len()..])
            }
            _ => rel.to_string(),
        };
        let dest = target_dir.join(&rel);
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
        installed_mod_formats: mod_formats,
        mod_loader: mod_loader.to_string(),
        mod_variant_mismatch,
    })
}

/// 实例里最终会加载 mod 的那个加载器。
/// 只看启用中的 dll：`.disable` 后缀是启动器的「禁用」机制，被禁用的加载器不算数。
/// 两个都在启用时以 BML+ 为准 —— 它是仍在维护的那个，Rockoon 自己的 mod 也只跑在它上面。
fn detect_mod_loader(instance: &Path) -> &'static str {
    let dir = instance.join("BuildingBlocks");
    if dir.join("BMLPlus.dll").is_file() {
        "bmlp"
    } else if dir.join("BML.dll").is_file() {
        "bml"
    } else {
        "none"
    }
}

/// 包里带上了哪几种 mod 产物，固定按 bmod、bmodp 的顺序返回。
fn mod_artifacts(info: &BrpInfo) -> Vec<String> {
    let mut formats: Vec<String> = Vec::new();
    for f in &info.content_files {
        if let Some(ext) = mod_ext_of(f) {
            if !formats.iter().any(|x| x == ext) {
                formats.push(ext.to_string());
            }
        }
    }
    formats.sort_by_key(|f| match f.as_str() {
        "bmod" => 0,
        _ => 1,
    });
    formats
}

/// 相对路径的 mod 产物类型（`.bmod`/`.bmod.zip` → bmod，`.bmodp`/`.bmodp.zip` → bmodp）。
/// 下载站的上传表单会把 zip 改名带归属后缀（作者用槽位声明那份产物属于哪个加载器），
/// 普通 `.zip`（作者直接传的 BRP 包）认不出归属，返回 None。
fn mod_ext_of(path: &str) -> Option<&'static str> {
    let lower = path.to_lowercase();
    if lower.ends_with(".bmodp") || lower.ends_with(".bmodp.zip") {
        Some("bmodp")
    } else if lower.ends_with(".bmod") || lower.ends_with(".bmod.zip") {
        Some("bmod")
    } else {
        None
    }
}

/// Map a BRP category to its on-disk install target inside the game instance.
fn target_for_category(category: &str, instance: &Path) -> (PathBuf, String) {
    match category {
        "map" => (
            instance.join("ModLoader").join("Maps"),
            "ModLoader/Maps/".into(),
        ),
        "mod" | "bmod" | "bmodp" => (
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const DIRS: [&str; 5] = ["Back", "Down", "Front", "Left", "Right"];

    /// 写一个最小合法 sky brp：content/ 下 5 个 Sky_X_<方位>.bmp
    fn write_sky_brp(path: &Path) {
        let file = File::create(path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        zw.start_file("manifest.json", opts).unwrap();
        zw.write_all(r#"{"manifest_version":1,"category":"sky","name":"sky test"}"#.as_bytes())
            .unwrap();
        for d in DIRS {
            zw.start_file(format!("content/Sky_X_{}.bmp", d), opts)
                .unwrap();
            zw.write_all(b"BMfake").unwrap();
        }
        zw.finish().unwrap();
    }

    fn fresh(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rockoon-brp-test-{}", name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn names_of(result: &BrpInstallResult) -> Vec<String> {
        let mut v: Vec<String> = result
            .installed_paths
            .iter()
            .map(|p| {
                Path::new(p)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        v.sort();
        v
    }

    #[test]
    fn sky_placeholder_is_replaced_with_target_letter() {
        let dir = fresh("replace");
        let brp = dir.join("sky.brp");
        let inst = dir.join("inst");
        write_sky_brp(&brp);

        // 第 1 关的字母是 L；小写输入也要认
        let res = install_brp(&brp, &inst, Some("l")).unwrap();
        let names = names_of(&res);
        assert_eq!(names.len(), 5, "应装 5 个方向");
        assert!(
            names.iter().all(|n| n.starts_with("Sky_L_")),
            "占位符应被替换为 Sky_L_*：{:?}",
            names
        );
        assert!(inst.join("Textures").join("Sky").join("Sky_L_Back.bmp").exists());
        assert!(!inst.join("Textures").join("Sky").join("Sky_X_Back.bmp").exists());
    }

    #[test]
    fn sky_keeps_placeholder_without_or_with_x_letter() {
        for letter in [None, Some("X")] {
            let dir = fresh("keep");
            let brp = dir.join("sky.brp");
            let inst = dir.join("inst");
            write_sky_brp(&brp);

            let res = install_brp(&brp, &inst, letter).unwrap();
            let names = names_of(&res);
            assert!(
                names.iter().all(|n| n.starts_with("Sky_X_")),
                "不指定关卡时应保留 X：{:?}",
                names
            );
        }
    }

    #[test]
    fn sky_rejects_unknown_letter() {
        let dir = fresh("bad-letter");
        let brp = dir.join("sky.brp");
        let inst = dir.join("inst");
        write_sky_brp(&brp);

        let err = install_brp(&brp, &inst, Some("Z")).unwrap_err();
        assert!(format!("{}", err).contains("非法"), "错误信息应说明字母非法：{}", err);
    }

    /// 写一个 mod brp：content/ 下按给定扩展名放文件
    fn write_mod_brp(path: &Path, exts: &[&str]) {
        let file = File::create(path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        zw.start_file("manifest.json", opts).unwrap();
        zw.write_all(br#"{"manifest_version":1,"category":"mod","name":"mod test"}"#)
            .unwrap();
        for (i, ext) in exts.iter().enumerate() {
            zw.start_file(format!("content/Mod{}.{}", i, ext), opts)
                .unwrap();
            zw.write_all(b"fake").unwrap();
        }
        zw.finish().unwrap();
    }

    /// 在实例里放一个（启用中的）加载器 dll
    fn put_loader(instance: &Path, name: &str) {
        let dir = instance.join("BuildingBlocks");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(name), b"fake-dll").unwrap();
    }

    #[test]
    fn mod_brp_accepts_one_or_both_artifacts() {
        for exts in [
            vec!["bmod"],
            vec!["bmodp"],
            vec!["bmod", "bmodp"],
            vec!["bmod", "zip"],
        ] {
            let dir = fresh("mod-ok");
            let brp = dir.join("m.brp");
            write_mod_brp(&brp, &exts);
            let info = validate_brp(&brp, &dir.join("inst"))
                .unwrap_or_else(|e| panic!("{:?} 应该通过校验，实际：{}", exts, e));
            assert_eq!(info.manifest.category, "mod");
        }
    }

    #[test]
    fn mod_brp_rejects_bad_shapes() {
        let cases: [(Vec<&str>, &str); 3] = [
            (vec!["bmod", "bmod"], "两份同为"),
            (vec!["bmod", "bmodp", "zip"], "1~2 个条目"),
            (vec!["txt"], "必须是 .bmod/.bmodp/.zip"),
        ];
        for (exts, needle) in cases {
            let dir = fresh("mod-bad");
            let brp = dir.join("m.brp");
            write_mod_brp(&brp, &exts);
            let err = validate_brp(&brp, &dir.join("inst"))
                .err()
                .unwrap_or_else(|| panic!("{:?} 不应该通过校验", exts));
            let msg = format!("{}", err);
            assert!(msg.contains(needle), "{:?} 的错误信息应包含「{}」，实际：{}", exts, needle, msg);
        }
    }

    #[test]
    fn mod_install_follows_installed_loader() {
        // 实例里装了 BML+：只装 .bmodp
        let dir = fresh("mod-bmlp");
        let brp = dir.join("m.brp");
        let inst = dir.join("inst");
        write_mod_brp(&brp, &["bmod", "bmodp"]);
        put_loader(&inst, "BMLPlus.dll");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(res.mod_loader, "bmlp");
        assert_eq!(names_of(&res), vec!["Mod1.bmodp"]);
        assert_eq!(res.installed_mod_formats, vec!["bmodp"]);
        assert!(!res.mod_variant_mismatch);
        assert!(!inst.join("ModLoader/Mods/Mod0.bmod").exists(), "老 BML 的那份不应装进去");

        // 实例里装了老 BML：只装 .bmod
        let inst = dir.join("inst-bml");
        put_loader(&inst, "BML.dll");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(res.mod_loader, "bml");
        assert_eq!(names_of(&res), vec!["Mod0.bmod"]);

        // 没有加载器：两份都装
        let inst = dir.join("inst-none");
        fs::create_dir_all(&inst).unwrap();
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(res.mod_loader, "none");
        assert_eq!(names_of(&res), vec!["Mod0.bmod", "Mod1.bmodp"]);

        // 被禁用的加载器不算数：只有 BML.dll.disable 时按「没有加载器」处理
        let inst = dir.join("inst-disabled");
        put_loader(&inst, "BML.dll.disable");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(res.mod_loader, "none");
    }

    #[test]
    fn mod_install_flags_variant_mismatch() {
        // 包只有 .bmod，但实例装的是 BML+：装上并标记不匹配
        let dir = fresh("mod-mismatch");
        let brp = dir.join("m.brp");
        let inst = dir.join("inst");
        write_mod_brp(&brp, &["bmod"]);
        put_loader(&inst, "BMLPlus.dll");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(res.mod_loader, "bmlp");
        assert_eq!(names_of(&res), vec!["Mod0.bmod"]);
        assert!(res.mod_variant_mismatch, "应标记产物与加载器不匹配");
    }

    #[test]
    fn mod_zip_with_kind_suffix_is_recognized() {
        // 下载站上传表单会把 zip 改名成 X.bmod.zip / X.bmodp.zip，启动器要按归属挑
        let dir = fresh("mod-zip-kind");
        let brp = dir.join("m.brp");
        let inst = dir.join("inst");
        write_mod_brp(&brp, &["bmod.zip", "bmodp.zip"]);
        put_loader(&inst, "BMLPlus.dll");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(names_of(&res), vec!["Mod1.bmodp.zip"]);
        assert_eq!(res.installed_mod_formats, vec!["bmodp"]);
        assert!(!res.mod_variant_mismatch);

        // 带归属后缀的 zip 与同类型的产物算重复
        write_mod_brp(&brp, &["bmod", "bmod.zip"]);
        let err = validate_brp(&brp, &inst).err().expect("应被拒");
        assert!(format!("{}", err).contains("两份同为"), "{}", err);
    }

    #[test]
    fn mod_install_installs_plain_zip_without_mismatch() {
        // 只有普通 zip（认不出归属，作者直接传 BRP 包的情况）：照装，不算不匹配
        let dir = fresh("mod-plain-zip");
        let brp = dir.join("m.brp");
        let inst = dir.join("inst");
        write_mod_brp(&brp, &["zip"]);
        put_loader(&inst, "BMLPlus.dll");
        let res = install_brp(&brp, &inst, None).unwrap();
        assert_eq!(names_of(&res), vec!["Mod0.zip"]);
        assert!(res.installed_mod_formats.is_empty());
        assert!(!res.mod_variant_mismatch, "认不出归属时不应该报不匹配");
    }
}
