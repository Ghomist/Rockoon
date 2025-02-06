use std::collections::HashMap;

use mod_config::{ConfigEntry, ModConfig};
use options::BallanceOptions;
use tdb::TDB;

mod mod_config;
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

#[tauri::command]
pub fn read_mod_config(path: String) -> Result<ModConfig, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let lines = &content.lines().collect::<Vec<_>>()[1..];
    let mut config = ModConfig::new();
    let mut current_category = String::new();
    let mut current_description = String::new();
    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.ends_with("{") {
            current_category = line[..line.len() - 1].trim().to_string();
            config
                .categories
                .insert(current_category.clone(), current_description.clone());
            config.entries.insert(current_category.clone(), Vec::new());
            continue;
        }
        if line.starts_with("}") {
            current_category = String::new();
            continue;
        }
        if line.starts_with("#") {
            current_description = line[1..].trim().to_string();
            continue;
        }

        let line: Vec<_> = line.split(" ").collect();
        if line.len() != 3 {
            continue;
        }
        let datatype = line[0].trim().to_string();
        let key = line[1].trim().to_string();
        let value = line[2].trim().to_string();
        if let Some(entries) = config.entries.get_mut(&current_category) {
            entries.push(ConfigEntry {
                name: key.to_string(),
                description: current_description.to_string(),
                datatype: datatype.to_string(),
                value: value.to_string(),
            });
        }
    }

    Ok(config)
}

#[tauri::command]
pub fn save_mod_config(path: String, config: ModConfig) -> Result<(), String> {
    let mut content = String::new();
    for (cat, entries) in config.entries {
        let desc = config.categories.get(&cat).unwrap();
        content.push_str(&format!("# {}\n{} {{\n\n", desc, cat));
        for entry in entries {
            content.push_str(&format!(
                "\t# {}\n\t{} {} {}\n\n",
                entry.description, entry.datatype, entry.name, entry.value
            ));
        }
        content.push_str("}\n\n");
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}
