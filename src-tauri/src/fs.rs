use std::{fs, path};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct File {
    name: String,
    size: u64,
}

#[tauri::command]
pub fn exists(path: String) -> Result<bool, String> {
    let exists = std::path::Path::new(&path).exists();
    Ok(exists)
}

#[tauri::command]
pub fn size(path: String) -> Result<u64, String> {
    let x = fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(x.len())
}

#[tauri::command]
pub fn list(path: String, exts: Vec<String>) -> Result<Vec<File>, String> {
    let mut matches = Vec::new();
    let exts = exts
        .iter()
        .flat_map(|s| vec![s.to_owned(), format!("{}.disable", s)])
        .collect::<Vec<_>>();

    // 遍历目录条目
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
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

#[tauri::command]
pub fn mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn disable(path: String, file_name: String) -> Result<(), String> {
    if !file_name.ends_with(".disable") {
        let folder = fs::canonicalize(&path).map_err(|e| e.to_string())?;
        let raw_file = folder.join(&file_name);
        let file_name = format!("{}.disable", &file_name);
        let new_file = folder.join(file_name);
        fs::rename(raw_file, new_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn enable(path: String, file_name: String) -> Result<(), String> {
    if file_name.ends_with(".disable") {
        let folder = fs::canonicalize(&path).map_err(|e| e.to_string())?;
        let raw_file = folder.join(&file_name);
        let file_name = &file_name.replace(".disable", "");
        let new_file = folder.join(file_name);
        fs::rename(raw_file, new_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn unzip(zip_path: String, output_dir: String) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }

        let output_path = path::Path::new(&output_dir).join(file.name());
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut out_file = fs::File::create(output_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}
