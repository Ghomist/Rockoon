// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::{debug, info, log_enabled, Level};

fn main() {
    // init logger
    env_logger::init();

    info!("Starting Rockoon");
    if log_enabled!(Level::Debug) {
        debug!("Debug logging enabled");
    }

    // launch app
    rockoon_lib::run()
}
