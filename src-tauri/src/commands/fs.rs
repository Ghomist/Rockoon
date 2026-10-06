use crate::common::exception::{RcResult, RcResultWith};
use log::info;
use regex::Regex;
use std::{fs, path, process};
use tauri::path::BaseDirectory;
use tauri::{command, AppHandle, Manager};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct File {
    name: String,
    size: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SkyboxFile {
    path: String,
    direction: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SkyboxAnalysisResult {
    files: Vec<SkyboxFile>,
    directions: Vec<String>,
}

#[command]
#[cfg(target_os = "windows")]
pub fn open_in_explorer(path: String) -> RcResult {
    let is_dir = path::Path::new(&path).is_dir();
    process::Command::new("explorer.exe")
        .args([if is_dir { "/e," } else { "/select," }, &path])
        .spawn()?;
    Ok(())
}

#[command]
#[cfg(target_os = "windows")]
pub fn open(path: String) -> RcResult {
    let path_ref: &std::path::Path = path.as_ref();
    if path_ref.is_dir() {
        return open_in_explorer(path);
    }
    process::Command::new("explorer.exe")
        .arg(path_ref)
        .spawn()?;
    Ok(())
}

#[command]
pub fn exists(path: String) -> RcResultWith<bool> {
    let exists = path::Path::new(&path).exists();
    Ok(exists)
}

#[command]
pub fn size(path: String) -> RcResultWith<u64> {
    let x = fs::metadata(&path)?;
    Ok(x.len())
}

#[command]
pub fn list(path: String, exts: Vec<String>) -> RcResultWith<Vec<File>> {
    let mut matches = Vec::new();
    let exts = exts
        .iter()
        .flat_map(|s| vec![s.to_owned(), format!("{}.disable", s)])
        .collect::<Vec<_>>();

    // 遍历目录条目
    for entry in fs::read_dir(path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        // 检查文件类型是否为普通文件
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !file_type.is_file() {
            continue;
        }

        // 获取文件路径和元数据
        let path = entry.path();
        let metadata = match fs::metadata(&path) {
            Ok(md) => md,
            Err(_) => continue, // 跳过无法获取元数据的文件
        };

        // 获取文件名并检查后缀
        if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
            if exts
                .iter()
                .any(|ext| file_name.to_lowercase().ends_with(ext))
            {
                matches.push(File {
                    name: file_name.to_string(),
                    size: metadata.len(),
                });
            }
        }
    }

    Ok(matches)
}

#[command]
pub fn list_dirs(path: String) -> RcResultWith<Vec<String>> {
    let mut matches = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            if let Ok(filename) = entry.path().into_os_string().into_string() {
                matches.push(filename);
            }
        }
    }

    Ok(matches)
}

#[command]
pub fn copy(from: String, to: String) -> RcResult {
    fs::copy(&from, &to)?;
    info!("Copied {} to {}", from, to);
    Ok(())
}

#[command]
pub fn mkdir(path: String) -> RcResult {
    fs::create_dir_all(&path)?;
    info!("Created directory {}", path);
    Ok(())
}

#[command]
pub fn delete(path: String) -> RcResult {
    fs::remove_file(&path)?;
    info!("Deleted {}", path);
    Ok(())
}

#[command]
pub fn remove_dir(path: String) -> RcResult {
    fs::remove_dir_all(&path)?;
    info!("Removed directory {}", path);
    Ok(())
}

#[command]
pub fn disable(path: String, file_name: String) -> RcResult {
    if !file_name.ends_with(".disable") {
        let folder = fs::canonicalize(&path)?;
        let raw_file = folder.join(&file_name);
        let file_name = format!("{}.disable", &file_name);
        let new_file = folder.join(file_name);
        fs::rename(&raw_file, &new_file)?;

        info!("Disabled {}", raw_file.display());
    }
    Ok(())
}

#[command]
pub fn enable(path: String, file_name: String) -> RcResult {
    if file_name.ends_with(".disable") {
        let folder = fs::canonicalize(&path)?;
        let raw_file = folder.join(&file_name);
        let file_name = &file_name.replace(".disable", "");
        let new_file = folder.join(file_name);
        fs::rename(&raw_file, &new_file)?;

        info!("Enabled {}", new_file.display());
    }
    Ok(())
}

#[command]
pub fn unzip(zip_path: String, output_dir: String) -> RcResult {
    let file = fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.is_dir() {
            continue;
        }

        let output_path = path::Path::new(&output_dir).join(file.name());

        // 防止路径遍历攻击
        if !output_path.starts_with(&output_dir) {
            return Err(crate::common::exception::RcError::Other(
                "Invalid file path in archive".to_string(),
            ));
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut out_file = fs::File::create(output_path)?;
        std::io::copy(&mut file, &mut out_file)?;
    }

    info!("Unzipped {} to {}", zip_path, output_dir);

    Ok(())
}

#[command]
pub fn get_common_dirs(app: AppHandle) -> RcResultWith<Vec<String>> {
    let mut dirs = Vec::new();

    // LocalAppData/Programs
    if let Ok(local_app_data) = std::env::var("LocalAppData") {
        let path = path::Path::new(&local_app_data).join("Programs");
        if let Some(s) = path.to_str() {
            dirs.push(s.to_string());
        }
    }

    // ProgramFiles
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        dirs.push(program_files);
    }

    // ProgramFiles(x86)
    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        dirs.push(program_files_x86);
    }

    let path_resolver = app.path();

    // 下载目录
    if let Ok(download) = path_resolver.download_dir() {
        if let Some(s) = download.to_str() {
            dirs.push(s.to_string());
        }
    }

    // 桌面目录
    if let Ok(desktop) = path_resolver.desktop_dir() {
        if let Some(s) = desktop.to_str() {
            dirs.push(s.to_string());
        }
    }

    // 所有盘根目录
    for drive in b'A'..=b'Z' {
        let drive = drive as char;
        let root = format!("{}:\\", drive);
        let path = path::Path::new(&root);
        if path.exists() {
            dirs.push(root);
        }
    }

    Ok(dirs)
}

#[command]
pub fn get_temp_dir() -> RcResultWith<String> {
    let temp_dir = std::env::temp_dir();
    info!("System temp directory: {}", temp_dir.display());
    Ok(temp_dir.to_string_lossy().to_string())
}

#[command]
pub fn install_rockoon_mod(app: AppHandle, path: String) -> RcResult {
    let mod_path = app.path().resolve(
        "resources/builtin-mods/RockoonIO.bmodp",
        BaseDirectory::Resource,
    )?;

    info!("Instance 'RockoonIO.bmodp' to {:?}", &path);

    fs::copy(&mod_path, &path)?;

    Ok(())
}

#[command]
pub fn write_file(path: String, data: Vec<u8>) -> RcResult {
    info!("Writing {} bytes to {}", data.len(), path);

    // 确保目标目录存在
    if let Some(parent) = path::Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    // 直接写入二进制数据
    fs::write(&path, &data)?;

    info!("Wrote {} bytes to {}", data.len(), path);

    Ok(())
}

#[command]
pub fn read_text_file(path: String) -> RcResultWith<String> {
    let content = fs::read_to_string(&path)?;
    Ok(content)
}

#[command]
pub fn write_text_file(path: String, content: String) -> RcResult {
    // 确保目标目录存在
    if let Some(parent) = path::Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(&path, content)?;
    info!("Wrote text to {}", path);
    Ok(())
}

#[command]
pub fn analyze_skybox_files(dir_path: String) -> RcResultWith<SkyboxAnalysisResult> {
    info!("Analyzing skybox files in {}", dir_path);

    let mut files = Vec::new();
    let mut directions_set = std::collections::HashSet::new();

    // 匹配方向的正则表达式
    let patterns = vec![
        Regex::new(r"(?i).*Front.*\.[Bb][Mm][Pp]$").unwrap(),
        Regex::new(r"(?i).*Back.*\.[Bb][Mm][Pp]$").unwrap(),
        Regex::new(r"(?i).*Left.*\.[Bb][Mm][Pp]$").unwrap(),
        Regex::new(r"(?i).*Right.*\.[Bb][Mm][Pp]$").unwrap(),
        Regex::new(r"(?i).*Down.*\.[Bb][Mm][Pp]$").unwrap(),
    ];

    // 递归遍历目录中的所有 BMP 文件
    let mut stack = vec![path::PathBuf::from(&dir_path)];

    while let Some(current_path) = stack.pop() {
        for entry in fs::read_dir(&current_path)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                // 获取文件名用于日志
                let file_name = path.file_name().and_then(|s| s.to_str()).ok_or_else(|| {
                    crate::common::exception::RcError::Other("Invalid filename".to_string())
                })?;

                // 只处理 BMP 文件（不区分大小写）
                let is_bmp = path
                    .extension()
                    .map(|ext| ext.to_string_lossy().to_lowercase() == "bmp")
                    .unwrap_or(false);

                if !is_bmp {
                    continue;
                }

                // 尝试匹配各个方向
                let mut detected_direction = None;
                for (i, pattern) in patterns.iter().enumerate() {
                    if pattern.is_match(file_name) {
                        let dir_name = match i {
                            0 => "Front",
                            1 => "Back",
                            2 => "Left",
                            3 => "Right",
                            4 => "Down",
                            _ => continue,
                        };
                        detected_direction = Some(dir_name.to_string());
                        break;
                    }
                }

                if let Some(direction) = detected_direction {
                    files.push(SkyboxFile {
                        path: path.to_string_lossy().to_string(),
                        direction: direction.clone(),
                    });
                    directions_set.insert(direction.clone());
                }
            } else if path.is_dir() {
                // 将子目录添加到栈中，实现递归遍历
                stack.push(path);
            }
        }
    }

    let directions: Vec<String> = directions_set.into_iter().collect();

    Ok(SkyboxAnalysisResult { files, directions })
}

/// 把浏览器显示不了的贴图（TGA：原版 `Textures/` 里就有 16 张）转成 PNG 缓存，
/// 返回缓存文件路径 —— 前端 `convertFileSrc()` 之后直接当图片用，
/// 不必给 CSP 开 `data:` / `blob:`。
///
/// 缓存名里带「路径 + 大小 + 修改时间」，所以贴图被换掉后会重新生成，不会显示旧图。
#[command]
pub fn convert_texture(path: String) -> RcResultWith<String> {
    let source = path::Path::new(&path);
    let meta = fs::metadata(source)?;
    let modified = meta
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let cache_dir = std::env::temp_dir().join("rockoon-textures");
    let key = fnv1a(&format!("{}|{}|{}", path, meta.len(), modified));
    let target = cache_dir.join(format!("{key:016x}.png"));

    if !target.exists() {
        fs::create_dir_all(&cache_dir)?;
        image::open(source)?.save(&target)?;
        info!("Converted texture {} -> {}", path, target.display());
    }

    Ok(target.to_string_lossy().to_string())
}

/// FNV-1a：只用来给缓存文件起个稳定名字，不值得再加个 hash 依赖。
fn fnv1a(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[command]
pub fn rename(from: String, to: String) -> RcResult {
    fs::rename(&from, &to)?;
    info!("Renamed {} to {}", from, to);
    Ok(())
}
