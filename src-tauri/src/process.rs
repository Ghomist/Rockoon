#[tauri::command]
pub fn execute(cwd: String, bin: String) -> Result<u32, String> {
    let child = std::process::Command::new(&bin)
        .current_dir(cwd)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

// TODO: 应校验，只允许关闭由启动器产生的线程
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn kill(pid: u32) -> Result<(), String> {
    std::process::Command::new("taskkill")
        .args(["/pid", &pid.to_string(), "/f"])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn kill(pid: u32) -> Result<(), String> {
    std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn check(pid: u32) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;

    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid)])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Check process failed".into());
    }

    let output = String::from_utf8_lossy(&output.stdout);
    let exists = output.contains("Player");

    Ok(exists)
}
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn check(pid: u32) -> Result<bool, String> {
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string()])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Check process failed".into());
    }

    let output = String::from_utf8_lossy(&output.stdout);
    let exists = output.contains("Player");

    Ok(exists)
}
