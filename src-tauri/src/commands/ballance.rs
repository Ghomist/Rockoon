use crate::{
    ballance::{
        mod_config::{ConfigEntry, ModConfig},
        options::BallanceOptions,
        tdb::Tdb,
    },
    common::exception::{RcResult, RcResultWith},
};
use std::collections::HashMap;
use tauri::command;

#[command]
pub fn read_options(path: String) -> RcResultWith<BallanceOptions> {
    let tdb = Tdb::new(&path)?;
    let mut options = BallanceOptions::new();
    options.read_from(&tdb)?;
    Ok(options)
}

#[command]
pub fn save_options(path: String, mut options: BallanceOptions) -> RcResult {
    let mut tdb = Tdb::new(&path)?;
    options.write_to(&mut tdb)?;
    tdb.write()?;
    Ok(())
}

#[command]
pub fn read_launch_config(path: String) -> RcResultWith<HashMap<String, HashMap<String, String>>> {
    let content = std::fs::read_to_string(&path)?;
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
            if let Some(category) = config_map.get_mut(&current_category) {
                let key = line[..index].trim().to_string();
                let value = line[index + 1..].trim().to_string();
                category.insert(key, value);
            }
        }
    }
    Ok(config_map)
}

#[command]
pub fn save_launch_config(
    path: String,
    config: HashMap<String, HashMap<String, String>>,
) -> RcResult {
    let mut content = String::new();
    for (category, items) in config {
        content.push_str(&format!("[{}]\n", category));
        for (key, value) in items {
            content.push_str(&format!("{}={}\n", key, value));
        }
    }
    std::fs::write(&path, content)?;

    Ok(())
}

#[command]
pub fn read_mod_config(path: String) -> RcResultWith<ModConfig> {
    let content = std::fs::read_to_string(&path)?;
    let lines = &content.lines().collect::<Vec<_>>()[1..];
    let mut config = ModConfig::new();
    let mut current_category = String::new();
    let mut current_description = String::new();
    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(line) = line.strip_suffix('{') {
            current_category = line.trim().to_string();
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
        if let Some(line) = line.strip_prefix('#') {
            current_description = line.trim().to_string();
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

#[command]
pub fn save_mod_config(path: String, config: ModConfig) -> RcResult {
    let mut content = String::new();
    for (cat, entries) in config.entries {
        if let Some(desc) = config.categories.get(&cat) {
            content.push_str(&format!("# {}\n{} {{\n\n", desc, cat));
            for entry in entries {
                content.push_str(&format!(
                    "\t# {}\n\t{} {} {}\n\n",
                    entry.description, entry.datatype, entry.name, entry.value
                ));
            }
            content.push_str("}\n\n");
        }
    }
    std::fs::write(&path, content)?;
    Ok(())
}
