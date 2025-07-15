use crate::common::exception::{RcError, RcResult, RcResultWith};
use std::{os::windows::process::CommandExt, path::PathBuf};
use tauri::command;

#[command]
pub fn execute(cwd: String, bin: String) -> RcResultWith<u32> {
    let child = std::process::Command::new(&bin).current_dir(&cwd).spawn()?;

    log::info!(
        "Started {} (pid: {})",
        PathBuf::from(cwd).join(bin).display(),
        child.id()
    );

    Ok(child.id())
}

// TODO: should check if the process is spawned by the launcher
#[cfg(target_os = "windows")]
#[command]
pub fn kill(pid: u32) -> RcResult {
    std::process::Command::new("taskkill")
        .args(["/pid", &pid.to_string(), "/f"])
        .spawn()?;

    log::info!("Killed process {}", pid);

    Ok(())
}
#[cfg(not(target_os = "windows"))]
#[command]
pub fn kill(pid: u32) -> RcResult {
    std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .spawn()?;

    log::info!("Killed process {}", pid);

    Ok(())
}

#[cfg(target_os = "windows")]
#[command]
pub fn check(pid: u32) -> RcResultWith<bool> {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid)])
        .creation_flags(0x08000000)
        .output()?;
    if !output.status.success() {
        return Err(RcError::Other("Check process failed".into()));
    }

    let output = String::from_utf8_lossy(&output.stdout);
    let exists = output.contains("Player");

    log::debug!("Checked process {}: {}", pid, exists);

    Ok(exists)
}
#[cfg(not(target_os = "windows"))]
#[command]
pub fn check(pid: u32) -> RcResultWith<bool> {
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string()])
        .output()?;
    if !output.status.success() {
        return Err(RcError::Other("Check process failed".into()));
    }

    let output = String::from_utf8_lossy(&output.stdout);
    let exists = output.contains("Player");

    log::debug!("Checked process {}: {}", pid, exists);

    Ok(exists)
}
