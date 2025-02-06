use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
    pub name: String,
    pub description: String,
    pub datatype: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModConfig {
    pub categories: HashMap<String, String>,
    pub entries: HashMap<String, Vec<ConfigEntry>>,
}

impl ModConfig {
    pub fn new() -> Self {
        Self {
            categories: HashMap::new(),
            entries: HashMap::new(),
        }
    }
}
