use crate::common::exception::{RcResult, RcResultWith};
#[cfg(not(target_os = "windows"))]
use crate::common::exception::RcError;
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

/// 按映像名列出正在运行的进程 pid（如 `Player.exe`，不区分大小写）。
///
/// TAS 编辑器用它确认游戏真的退干净了：`kill` 只是发出 `taskkill`、不等它结束，
/// `Player.exe` 往往还要再活一小会儿；Ballance 不支持多开，这时候再启动会出问题。
/// 也能发现从主窗口启动、编辑器不知道 pid 的那个游戏。
///
/// 用 Toolhelp 快照（微秒级），**不要**再起 `tasklist`：那一下要 300ms+，编辑器会轮询它。
#[cfg(target_os = "windows")]
#[command(async)]
pub fn find_processes(image: String) -> RcResultWith<Vec<u32>> {
    Ok(win_proc::pids_by_image(&image))
}
#[cfg(not(target_os = "windows"))]
#[command(async)]
pub fn find_processes(image: String) -> RcResultWith<Vec<u32>> {
    let _ = image;
    Ok(Vec::new())
}

/// pid 对应的进程还活着、而且是 Ballance 的 Player（映像名含 `Player`）吗。
///
/// 原生 `OpenProcess` + `GetExitCodeProcess`（微秒级）。原来起 `tasklist /FI "PID eq …"`
/// 要 300ms 左右，而且命令没写 async 时跑在主线程 —— TAS 编辑器每 400ms 轮询一次，
/// 主线程八成时间被堵住，整个编辑器（包括调速快捷键）都卡。
#[cfg(target_os = "windows")]
#[command(async)]
pub fn check(pid: u32) -> RcResultWith<bool> {
    let exists = win_proc::is_alive_player(pid);
    log::debug!("Checked process {}: {}", pid, exists);
    Ok(exists)
}

/// 进程查询的 Win32 实现（不起子进程）。
#[cfg(target_os = "windows")]
mod win_proc {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    /// `GetExitCodeProcess` 对还在运行的进程返回的值
    const STILL_ACTIVE: u32 = 259;

    fn utf16_until_nul(buf: &[u16]) -> String {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    }

    pub fn is_alive_player(pid: u32) -> bool {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut code = 0u32;
            let alive = GetExitCodeProcess(h, &mut code) != 0 && code == STILL_ACTIVE;
            // 和原来的 tasklist 版一样只认 Player：pid 被别的进程复用时不能误判成游戏还在
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let is_player = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len)
                != 0
                && utf16_until_nul(&buf[..len as usize]).contains("Player");
            CloseHandle(h);
            alive && is_player
        }
    }

    pub fn pids_by_image(image: &str) -> Vec<u32> {
        let mut out = Vec::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return out;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut entry) != 0;
            while ok {
                if utf16_until_nul(&entry.szExeFile).eq_ignore_ascii_case(image) {
                    out.push(entry.th32ProcessID);
                }
                ok = Process32NextW(snap, &mut entry) != 0;
            }
            CloseHandle(snap);
        }
        out
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::time::Instant;

        #[test]
        fn finds_explorer_and_rejects_non_player() {
            assert!(!pids_by_image("explorer.exe").is_empty());
            assert!(pids_by_image("EXPLORER.EXE").len() == pids_by_image("explorer.exe").len());
            // 自己（测试进程）活着，但不是 Player
            assert!(!is_alive_player(std::process::id()));
            // 不存在的 pid
            assert!(!is_alive_player(0xFFFF_FFF0));
            let t = Instant::now();
            for _ in 0..100 {
                pids_by_image("Player.exe");
                is_alive_player(std::process::id());
            }
            println!("100 rounds of snapshot + check: {:?}", t.elapsed());
        }
    }
}
#[cfg(not(target_os = "windows"))]
#[command(async)]
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
