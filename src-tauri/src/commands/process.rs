use crate::common::exception::{RcResult, RcResultWith};
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::{os::windows::process::CommandExt, path::PathBuf};
use tauri::command;

#[cfg(target_os = "windows")]
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

/// 其它平台（macOS）：`.exe` 交给 Wine（commands/wine.rs）。async 是因为要等 Wine 把游戏进程拉起来
/// 才知道 pid（见 unix_proc::wait_for_launcher）。高优先级只有 TAS 编辑器用，这里不支持。
#[cfg(not(target_os = "windows"))]
#[command(async)]
pub fn execute(
    app: tauri::AppHandle,
    cwd: String,
    bin: String,
    env: Option<HashMap<String, String>>,
    args: Option<Vec<String>>,
    high_priority: Option<bool>,
) -> RcResultWith<u32> {
    let _ = high_priority;
    let is_exe = bin.to_lowercase().ends_with(".exe");
    let (mut cmd, via_launcher) = if is_exe {
        crate::commands::wine::game_command(&app, &bin)?
    } else {
        (std::process::Command::new(&bin), false)
    };
    // 游戏里的 mod 只认 Windows 路径：环境变量里的绝对路径先换成 Z:\ 形式
    if let Some(env_vars) = env {
        cmd.envs(
            env_vars
                .into_iter()
                .map(|(k, v)| (k, crate::commands::wine::to_windows_path(&v))),
        );
    }
    cmd.current_dir(&cwd);
    if let Some(args) = args {
        cmd.args(args);
    }
    let running_before = unix_proc::pids_running(&bin);
    // Mac 很少重启，开机时间几乎总在原版输入管理器出 bug 的区间（见 ballance/input_fix.rs）：
    // 启动游戏前给它打补丁。修不了也照常启动
    if let Some(root) = std::path::Path::new(&bin).parent().and_then(|p| p.parent()) {
        if let Err(e) = crate::ballance::input_fix::fix_input_manager(root) {
            log::warn!("Patching the input manager failed: {e}");
        }
    }
    let child = cmd.spawn()?;

    let pid = if via_launcher {
        unix_proc::wait_for_launcher(child, &bin, &running_before)?
    } else if is_exe {
        unix_proc::wait_for_wine_game(child, &bin, &running_before)?
    } else {
        unix_proc::reap(child)
    };

    log::info!(
        "Started {} (pid: {})",
        std::path::PathBuf::from(cwd).join(bin).display(),
        pid
    );

    Ok(pid)
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
        .status()?;

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
/// 其它平台用 `ps`。游戏跑在 Wine 里，Wine 会把进程命令行改写成 Windows 路径
/// （`Z:\…\Bin\Player.exe`），所以按命令行里的可执行文件名匹配。
#[cfg(not(target_os = "windows"))]
#[command(async)]
pub fn find_processes(image: String) -> RcResultWith<Vec<u32>> {
    Ok(unix_proc::processes()?
        .into_iter()
        .filter(|(_, command)| unix_proc::runs_image(command, &image))
        .map(|(pid, _)| pid)
        .collect())
}

#[cfg(not(target_os = "windows"))]
mod unix_proc {
    use crate::common::exception::{RcError, RcResultWith};
    use std::process::Child;
    use std::time::{Duration, Instant};

    /// 正在跑的进程（pid, 命令行），不含僵尸进程
    pub fn processes() -> RcResultWith<Vec<(u32, String)>> {
        let output = std::process::Command::new("ps")
            .args(["-axo", "pid=,stat=,command="])
            .output()?;
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(text
            .lines()
            .filter_map(|line| {
                // 列之间是不定长的空格补齐
                let (pid, rest) = line.trim_start().split_once(char::is_whitespace)?;
                let (stat, command) = rest.trim_start().split_once(char::is_whitespace)?;
                let pid = pid.parse().ok()?;
                (!stat.starts_with('Z')).then(|| (pid, command.trim_start().to_string()))
            })
            .collect())
    }

    /// 和 `exe` 同名、正在跑的进程（启动前记一份，好认出哪个是新起的）
    pub fn pids_running(exe: &str) -> Vec<u32> {
        let image = image_name(exe);
        processes()
            .unwrap_or_default()
            .into_iter()
            .filter(|(_, command)| runs_image(command, image))
            .map(|(pid, _)| pid)
            .collect()
    }

    fn image_name(exe: &str) -> &str {
        exe.rsplit(['/', '\\']).next().unwrap_or(exe)
    }

    /// 后台 wait 掉子进程（不然它退出后一直是僵尸，`ps` 还查得到），返回它的 pid
    pub fn reap(child: Child) -> u32 {
        let pid = child.id();
        std::thread::spawn(move || {
            let mut child = child;
            let _ = child.wait();
        });
        pid
    }

    /// 启动后新出现的游戏进程（不在 `before` 里、也不是 `skip`）。优先认路径完全一致的
    /// （多开别的游戏目录时不会认错），否则同名的新进程也行
    fn find_new_game(exe: &str, before: &[u32], skip: u32) -> RcResultWith<Option<u32>> {
        let win_path = crate::commands::wine::to_windows_path(exe).to_lowercase();
        let image = image_name(exe);
        let fresh: Vec<(u32, String)> = processes()?
            .into_iter()
            .filter(|(pid, command)| {
                *pid != skip && !before.contains(pid) && runs_image(command, image)
            })
            .collect();
        Ok(fresh
            .iter()
            .find(|(_, command)| command.to_lowercase().starts_with(&win_path))
            .or(fresh.first())
            .map(|(pid, _)| *pid))
    }

    /// 经过游戏启动器（BallanceLauncher.exe，见 commands/wine.rs）时：Wine 进程在游戏窗口出来后退出，
    /// 期间游戏没起来它会自己重试。等它退出，再去找最后留下来的那个游戏进程。
    pub fn wait_for_launcher(child: Child, exe: &str, before: &[u32]) -> RcResultWith<u32> {
        // 启动器每次尝试最多等 30 秒窗口 + 5 秒确认，最多 8 次（出事的尝试一般 2 秒内就结束）
        const TIMEOUT: Duration = Duration::from_secs(300);
        let started = Instant::now();
        let mut child = child;
        loop {
            if let Some(status) = child.try_wait()? {
                if !status.success() {
                    return Err(RcError::Other(
                        "游戏启动失败（已自动重试 8 次），请再试一次；详见启动器日志目录里的 wine.log"
                            .into(),
                    ));
                }
                return find_new_game(exe, before, 0)?.ok_or_else(|| {
                    RcError::Other("游戏启动后马上退出了，详见启动器日志目录里的 wine.log".into())
                });
            }
            if started.elapsed() > TIMEOUT {
                log::warn!("Timed out waiting for the launcher of {exe}");
                let _ = child.kill();
                reap(child);
                return Err(RcError::Other("游戏启动超时".into()));
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    /// 不经过游戏启动器时：`wine Player.exe` 起来的 `wine` 进程不是游戏本身 —— 游戏跑在 Wine
    /// 另起的进程里（命令行被改写成 `Z:\…\Bin\Player.exe`），`wine` 只是在旁边等它退出。
    /// 启动器要跟踪、结束的是游戏进程，所以这里等它出现，返回它的 pid。Wine 直接报错退出时把错误交给前端。
    pub fn wait_for_wine_game(child: Child, exe: &str, before: &[u32]) -> RcResultWith<u32> {
        const TIMEOUT: Duration = Duration::from_secs(20);
        let started = Instant::now();
        let mut child = child;
        let mut exit_status = None;
        loop {
            if let Some(pid) = find_new_game(exe, before, child.id())? {
                if exit_status.is_none() {
                    reap(child);
                }
                return Ok(pid);
            }
            if exit_status.is_none() {
                exit_status = child.try_wait()?;
            }
            if let Some(status) = exit_status {
                // wine 退出了还没等到游戏进程：退出码非 0 就是启动失败；
                // 是 0 的话游戏可能还在起，再等等
                if !status.success() {
                    return Err(RcError::Other(format!(
                        "游戏启动失败（Wine 退出：{status}），详见启动器日志目录里的 wine.log"
                    )));
                }
            }
            if started.elapsed() > TIMEOUT {
                log::warn!("Timed out waiting for the game process of {exe}");
                return Ok(match exit_status {
                    None => reap(child),
                    Some(_) => child.id(),
                });
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    /// 命令行里有没有以 `image` 结尾的可执行文件（不区分大小写；`/` 和 `\` 都算路径分隔符）
    pub fn runs_image(command: &str, image: &str) -> bool {
        let command = command.to_lowercase();
        let image = image.to_lowercase();
        command.match_indices(&image).any(|(i, _)| {
            let before = command[..i].chars().last();
            let after = command[i + image.len()..].chars().next();
            matches!(before, None | Some('/') | Some('\\')) && after.is_none_or(char::is_whitespace)
        })
    }

    #[cfg(test)]
    mod tests {
        use super::runs_image;

        #[test]
        fn matches_wine_rewritten_command_lines() {
            let player = |command: &str| runs_image(command, "Player.exe");
            assert!(player(r"Z:\Users\me\Games\Ballance\Bin\Player.exe "));
            assert!(player(r"Z:\Users\me\My Games\Bin\PLAYER.EXE -w 1024"));
            // Wine 还没改写命令行时（刚 spawn）是 wine 加上 unix 路径
            assert!(player("/opt/wine/bin/wine /Users/me/Bin/Player.exe"));
            assert!(!player(r"C:\windows\system32\winedevice.exe"));
            assert!(!player(r"Z:\Bin\NewPlayer.exe"));
            assert!(!player(r"Z:\Bin\Player.exe.bak"));
        }
    }
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
        .args(["-o", "stat=,command=", "-p", &pid.to_string()])
        .output()?;
    // pid 不存在时 ps 的退出码非 0：游戏已经退了，不是出错
    let output = String::from_utf8_lossy(&output.stdout);
    let line = output.trim();
    // 僵尸进程（stat 以 Z 开头）也算已退出
    let exists = !line.is_empty() && !line.starts_with('Z') && line.contains("Player");

    log::debug!("Checked process {}: {}", pid, exists);

    Ok(exists)
}
