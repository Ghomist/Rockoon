#[derive(serde::Serialize, serde::Deserialize)]
pub struct File {
    name: String,
    ext: String,
    size: u64,
}

#[tauri::command]
pub fn exists(path: String) -> Result<bool, String> {
    let exists = std::path::Path::new(&path).exists();
    Ok(exists)
}

#[tauri::command]
pub fn size(path: String) -> Result<u64, String> {
    let x = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(x.len())
}

#[tauri::command]
pub fn list(path: String, exts: Vec<String>) -> Result<Vec<File>, String> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if exts.contains(&ext.to_str().unwrap().to_string()) {
                    let name = path.file_stem().unwrap().to_str().unwrap().to_string();
                    let ext = ext.to_str().unwrap().to_string();
                    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
                    files.push(File { name, ext, size });
                }
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn delete(path: String) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}
