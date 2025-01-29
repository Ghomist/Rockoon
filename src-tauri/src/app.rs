use tauri::Runtime;

#[tauri::command]
pub fn log(msg: String) {
    println!("{}", msg);
}

#[tauri::command]
pub async fn hide_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn show_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_window<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}
