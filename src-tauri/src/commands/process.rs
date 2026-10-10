use crate::common::exception::{RcError, RcResult, RcResultWith};
use std::collections::HashMap;
use std::{os::windows::process::CommandExt, path::PathBuf};
use tauri::command;

#[command]
pub fn execute(
    cwd: String,
    bin: String,
    env: Option<HashMap<String, String>>,
    // 额外的命令行参数（TAS 编辑器用它给游戏定分辨率：`-w 1024 -h 768`）
    args: Option<Vec<String>>,
    // 要不要把游戏进程提到「高」优先级（TAS 回放用）
    high_priority: Option<bool>,
) -> RcResultWith<u32> {
    let mut cmd = std::process::Command::new(&bin);
    cmd.current_dir(&cwd);
    if let Some(env_vars) = env {
        cmd.envs(env_vars);
    }
    if let Some(args) = args {
        cmd.args(args);
    }
    let child = cmd.creation_flags(0x08000000).spawn()?;

    // TAS 回放对帧稳定很敏感，而编辑器（WebView2）会时不时抢 CPU（鼠标一动尤其明显）：
    // 需要时把游戏提到 HIGH_PRIORITY_CLASS，让它的渲染/回放线程不至于被编辑器挤掉帧。
    #[cfg(target_os = "windows")]
    if high_priority.unwrap_or(false) {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::System::Threading::{SetPriorityClass, HIGH_PRIORITY_CLASS};
        let handle = child.as_raw_handle() as HANDLE;
        let ok = unsafe { SetPriorityClass(handle, HIGH_PRIORITY_CLASS) } != 0;
        log::info!(
            "Set game process {} priority to HIGH: {}",
            child.id(),
            if ok { "ok" } else { "failed" }
        );
    }
    #[cfg(not(target_os = "windows"))]
    let _ = high_priority;

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
        .creation_flags(0x08000000)
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

/// 按映像名列出正在运行的进程 pid（如 `Player.exe`）。
///
/// TAS 编辑器用它确认游戏真的退干净了：`kill` 只是发出 `taskkill`、不等它结束，
/// `Player.exe` 往往还要再活一小会儿；Ballance 不支持多开，这时候再启动会出问题。
/// 也能发现从主窗口启动、编辑器不知道 pid 的那个游戏。
#[cfg(target_os = "windows")]
#[command]
pub fn find_processes(image: String) -> RcResultWith<Vec<u32>> {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {image}"), "/FO", "CSV", "/NH"])
        .creation_flags(0x08000000)
        .output()?;
    if !output.status.success() {
        return Err(RcError::Other("List processes failed".into()));
    }
    // 每行形如 "Player.exe","21432","Console","1","143,600 K"；没有匹配时是一句本地化提示，过滤掉
    let text = String::from_utf8_lossy(&output.stdout);
    let pids = text
        .lines()
        .filter_map(|line| {
            let cols: Vec<&str> = line.split("\",\"").collect();
            let name = cols.first()?.trim_start_matches('"');
            if cols.len() >= 2 && name.eq_ignore_ascii_case(&image) {
                cols[1].trim_matches('"').parse().ok()
            } else {
                None
            }
        })
        .collect();
    Ok(pids)
}
#[cfg(not(target_os = "windows"))]
#[command]
pub fn find_processes(image: String) -> RcResultWith<Vec<u32>> {
    let _ = image;
    Ok(Vec::new())
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
