//! 实例里地图 / mod 文件的 sha256，给「按 hash 反查下载站资源」用（见 `src/services/resourceUpdates.ts`）。
//!
//! 启动、开游戏、进页面都会查一次，而文件基本不变，所以按「路径 + 大小 + 修改时间」缓存 hash，
//! 只在本次运行内有效。

use crate::common::exception::RcResultWith;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;
use tauri::command;

const MAP_EXTS: &[&str] = &[".nmo", ".cmo"];
const MOD_EXTS: &[&str] = &[".bmod", ".bmodp", ".zip"];
/// 启动器的「禁用」就是加这个后缀，内容不变，照样要认
const DISABLED_SUFFIX: &str = ".disable";

type HashCache = HashMap<PathBuf, (u64, SystemTime, String)>;
static HASH_CACHE: LazyLock<Mutex<HashCache>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFile {
    /// 磁盘上的绝对路径（被禁用的文件带 `.disable`）
    pub path: String,
    /// `map` / `mod`
    pub kind: &'static str,
    pub size: u64,
    pub sha256: String,
}

fn matches_ext(path: &Path, exts: &[&str]) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    let name = name.to_lowercase();
    let name = name.strip_suffix(DISABLED_SUFFIX).unwrap_or(&name);
    exts.iter().any(|ext| name.ends_with(ext))
}

fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let mut hex = String::with_capacity(64);
    for byte in hasher.finalize() {
        let _ = write!(hex, "{byte:02x}");
    }
    Ok(hex)
}

fn cached_sha256(path: &Path, size: u64, modified: SystemTime) -> std::io::Result<String> {
    if let Some((s, m, hash)) = HASH_CACHE.lock().unwrap().get(path) {
        if *s == size && *m == modified {
            return Ok(hash.clone());
        }
    }
    let hash = sha256_of(path)?;
    HASH_CACHE
        .lock()
        .unwrap()
        .insert(path.to_path_buf(), (size, modified, hash.clone()));
    Ok(hash)
}

/// 扫一个目录。目录不存在、单个文件读不了都跳过：这里只是查更新，不该因此报错。
fn scan(dir: &Path, kind: &'static str, exts: &[&str], recursive: bool, out: &mut Vec<ResourceFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            if recursive {
                scan(&path, kind, exts, recursive, out);
            }
            continue;
        }
        if !file_type.is_file() || !matches_ext(&path, exts) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        match cached_sha256(&path, meta.len(), modified) {
            Ok(sha256) => out.push(ResourceFile {
                path: path.to_string_lossy().to_string(),
                kind,
                size: meta.len(),
                sha256,
            }),
            Err(e) => log::warn!("Cannot hash {}: {}", path.display(), e),
        }
    }
}

fn collect(instance: &Path) -> Vec<ResourceFile> {
    let loader = instance.join("ModLoader");
    let mut out = Vec::new();
    // 地图页支持子文件夹，mod 只在 Mods 根下
    scan(&loader.join("Maps"), "map", MAP_EXTS, true, &mut out);
    scan(&loader.join("Mods"), "mod", MOD_EXTS, false, &mut out);
    out
}

/// 算实例里所有地图 / mod 的 hash。要读盘，必须 async，不能占主线程。
#[command(async)]
pub fn hash_instance_resources(instance_path: String) -> RcResultWith<Vec<ResourceFile>> {
    Ok(collect(Path::new(&instance_path)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_maps_recursively_and_mods_at_top_level() {
        let root = std::env::temp_dir().join(format!("rockoon-hash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let maps = root.join("ModLoader/Maps/sub");
        let mods = root.join("ModLoader/Mods/nested");
        fs::create_dir_all(&maps).unwrap();
        fs::create_dir_all(&mods).unwrap();
        fs::write(maps.join("A.NMO"), b"abc").unwrap();
        fs::write(maps.join("b.cmo.disable"), b"abc").unwrap();
        fs::write(maps.join("readme.txt"), b"abc").unwrap();
        fs::write(root.join("ModLoader/Mods/M.bmodp"), b"abc").unwrap();
        fs::write(mods.join("deep.bmod"), b"abc").unwrap();

        let mut found = collect(&root);
        found.sort_by(|a, b| a.path.cmp(&b.path));
        let names: Vec<_> = found
            .iter()
            .map(|f| Path::new(&f.path).file_name().unwrap().to_str().unwrap())
            .collect();
        assert_eq!(names, ["A.NMO", "b.cmo.disable", "M.bmodp"]);
        assert_eq!(found[0].kind, "map");
        assert_eq!(found[2].kind, "mod");
        // sha256("abc")
        assert_eq!(
            found[0].sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rehashes_when_the_file_changes() {
        let root = std::env::temp_dir().join(format!("rockoon-rehash-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("x.nmo");
        fs::write(&file, b"one").unwrap();
        let first = cached_sha256(&file, 3, SystemTime::UNIX_EPOCH).unwrap();
        fs::write(&file, b"two!").unwrap();
        assert_eq!(cached_sha256(&file, 3, SystemTime::UNIX_EPOCH).unwrap(), first);
        assert_ne!(cached_sha256(&file, 4, SystemTime::UNIX_EPOCH).unwrap(), first);
        let _ = fs::remove_dir_all(&root);
    }
}
