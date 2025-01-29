use std::collections::HashMap;

use options::BallanceOptions;
use tdb::TDB;

mod options;
mod tdb;

#[tauri::command]
pub fn read_options(path: String) -> Result<BallanceOptions, String> {
    let tdb = TDB::new(&path);
    let mut options = BallanceOptions::new();
    options.read_from(&tdb);
    Ok(options)
}

#[tauri::command]
pub fn save_options(path: String, mut options: BallanceOptions) -> Result<(), String> {
    let mut tdb = TDB::new(&path);
    options.write_to(&mut tdb);
    tdb.write();
    Ok(())
}

#[tauri::command]
pub fn read_launch_config(
    path: String,
) -> Result<HashMap<String, HashMap<String, String>>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut config_map = HashMap::new();
    let mut current_category = String::new();
    for line in lines {
        if line.starts_with('[') {
            current_category = line[1..line.len() - 1].trim().to_string();
            if !config_map.contains_key(&current_category) {
                config_map.insert(current_category.to_string(), HashMap::new());
            }
        } else if let Some(index) = line.find('=') {
            let category = config_map.get_mut(&current_category).unwrap();
            let key = line[..index].trim().to_string();
            let value = line[index + 1..].trim().to_string();
            category.insert(key, value);
        }
    }
    Ok(config_map)
}

#[tauri::command]
pub fn save_launch_config(
    path: String,
    config: HashMap<String, HashMap<String, String>>,
) -> Result<(), String> {
    let mut content = String::new();
    for (category, items) in config {
        content.push_str(&format!("[{}]\n", category));
        for (key, value) in items {
            content.push_str(&format!("{}={}\n", key, value));
        }
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}
