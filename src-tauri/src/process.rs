#[tauri::command]
pub fn execute(cwd: String, bin: String) -> Result<u32, String> {
    let child = std::process::Command::new(&bin)
        .current_dir(cwd)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

#[cfg(target_os = "windows")]
#[tauri::command] // TODO: 应校验，只允许关闭由启动器产生的线程
pub fn kill(pid: u32) -> Result<(), String> {
    std::process::Command::new("taskkill")
        .args(["/pid", &pid.to_string(), "/f"])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(not(target_os = "windows"))]
pub fn kill() -> Result<(), String> {
    Err("Not support on your OS".into()) // TODO
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn check(pid: u32) -> Result<bool, String> {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid)])
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
pub fn check(pid: u32) -> Result<bool, String> {
    Err("Not support on your OS".into()) // TODO
}
