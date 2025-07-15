use crate::common::exception::{RcResult, RcResultWith};
use std::{fs, path};
use tauri::{command, AppHandle, Manager};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct File {
    name: String,
    size: u64,
}

#[command]
pub fn exists(path: String) -> RcResultWith<bool> {
    let exists = std::path::Path::new(&path).exists();
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
    fs::copy(from, to)?;
    Ok(())
}

#[command]
pub fn mkdir(path: String) -> RcResult {
    fs::create_dir_all(&path)?;
    Ok(())
}

#[command]
pub fn delete(path: String) -> RcResult {
    fs::remove_file(path)?;
    Ok(())
}

#[command]
pub fn disable(path: String, file_name: String) -> RcResult {
    if !file_name.ends_with(".disable") {
        let folder = fs::canonicalize(&path)?;
        let raw_file = folder.join(&file_name);
        let file_name = format!("{}.disable", &file_name);
        let new_file = folder.join(file_name);
        fs::rename(raw_file, new_file)?;
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
        fs::rename(raw_file, new_file)?;
    }
    Ok(())
}

#[command]
pub fn unzip(zip_path: String, output_dir: String) -> RcResult {
    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.is_dir() {
            continue;
        }

        let output_path = path::Path::new(&output_dir).join(file.name());
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut out_file = fs::File::create(output_path)?;
        std::io::copy(&mut file, &mut out_file)?;
    }

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
