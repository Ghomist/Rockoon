//! 把 Ballance 游戏窗口「摆进」启动器窗口的一块区域（Win32 **顶层窗口 + owner**），
//! 并提供移动 / 解除 / 查询三个配套命令。只做 Rust 侧，前端交互由别的模块负责。
//!
//! ## 为什么是「顶层窗口 + owner」而不是 `SetParent`
//!
//! 2026-10-09 实测（同一台机、编辑器窗口**真前台**、`WindowFromPoint(区域中心)` 已确认游戏
//! 就是输入目标、用 `SendInput` 注入真实鼠标输入）：
//!
//! - reparent 成子窗口（`WS_CHILD`）后，**真实鼠标输入会让游戏主循环停摆**：游戏进程 CPU
//!   `0.98 核 → 0.10~0.16 核`、画面全黑（`PrintWindow` 裁剪区平均亮度 0），鼠标一停立刻恢复
//!   （回到 0.99 核 / 亮度 214）。`SetCursorPos` 合成移动**不产生 `WM_INPUT`**，怎么扫都不
//!   复现 —— 必须用 `SendInput` 才测得出来。
//! - 不 reparent、只把游戏窗口当**普通顶层窗口**摆到同一区域（owner = 编辑器窗口）：
//!   同样注入下 **0.80 核、正常渲染**，不卡。
//! - 对照：同一场注入扫在编辑器**自己的区域**上，游戏 1.00 核完全不受影响。
//!
//! 所以这里**不做 `SetParent`**，只做三件事：
//! 1. 剥掉标题栏 / 边框（窗口无边框 → 「窗口 rect == 客户区 rect」，可以直接按区域摆位）；
//! 2. 把 owner 设成编辑器窗口 —— owned window 始终压在 owner 上面、**owner 最小化时自动隐藏、
//!    复原时一起回来**、owner 销毁时一起销毁（用户明确要求最小化 / 复原必须带动游戏窗口）；
//! 3. 按「编辑器客户区 rect → 屏幕坐标」`SetWindowPos(HWND_TOP)` 摆到位。
//!
//! ## 默认「只看不碰」（鼠标不被游戏吃掉）
//!
//! 游戏用 DirectInput 独占鼠标：只要它是前台窗口，指针就被藏起来、被它吃掉。摆位期间默认给
//! 游戏窗口加 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE`（alpha 255，看起来不变）：
//! 鼠标点击直接穿透到下面的编辑器、游戏窗口也不会被激活；attach 后再把前台还给编辑器（游戏刚
//! 启动时会自己抢前台）。游戏一失去前台，DirectInput 就释放鼠标。看门狗发现游戏又抢回前台时
//! 同样还回去。需要给游戏按键（BallanceTAS 的 F4~F8 / 停止键）时用
//! `set_game_window_interactive(true)` 切到「可交互」：去掉这三个样式并把前台交给游戏。
//!
//! ## 保留下来的老结论（spike 实测，不要凭直觉改）
//!
//! 1. 游戏主窗口类名固定 `Ballance`；**必须等 `IsWindowVisible` 再动手**，抢在游戏初始化中途
//!    操作会把窗口坐标搞成 `(-31656,-31904)`。
//! 2. 游戏 `OnMove()` 会把窗口坐标写回 `Bin/Player.ini`，所以解除时必须还原**嵌入前的原始
//!    rect（屏幕坐标）**，游戏随后把原始坐标写回 ini，ini 就自愈了。
//! 3. 游戏内 `Alt+Enter` 会自己把窗口设成全屏铺满显示器，会破坏摆位 → 看门狗检测到漂移后
//!    重新施加「无边框样式 + owner + 预期 rect」。
//! 4. **不能把游戏窗口直接塞进 Tauri 那个窗口**：WebView2 的内容是 DirectComposition 单独合成
//!    的，不遵守同一个顶层窗口里子窗口的 z-order → 游戏窗口被整块 WebView 盖住（诊断方法：
//!    `PrintWindow(child, PW_RENDERFULLCONTENT)` 抓到的是 React 的 `bg-neutral-950`，亮度恰好
//!    10.0；detach 后同一个窗口的像素立刻回到 114 = 游戏一直在渲染，只是看不见）。
//!    **顶层窗口之间**走 Win32 层叠，所以「游戏自己当顶层窗口」才是对的 —— 它天然压在 WebView
//!    上面，不再需要任何宿主窗口。

use crate::common::exception::{RcResult, RcResultWith};
use serde::Serialize;

/// 嵌入状态快照（诊断 / UI 用）。未嵌入时全部为零值。
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameWindowInfo {
    pub attached: bool,
    pub pid: u32,
    pub hwnd: i64,
    pub focused: bool,
    /// 可交互（鼠标键盘交给游戏）；false = 只看不碰（点击穿透、不抢前台）
    pub interactive: bool,
    pub rect: [i32; 4],
}

/// 这个功能只针对 Windows（项目本身也是 Windows-only），其它平台给同名命令但不做事。
#[cfg(not(target_os = "windows"))]
use crate::common::exception::RcError;

#[cfg(not(target_os = "windows"))]
fn unsupported() -> RcError {
    RcError::Other("game window embedding is only supported on Windows".into())
}

/// 找到 pid 对应的游戏主窗口并摆到「发起 IPC 的那个窗口」的客户区 (x,y,w,h)。
/// 找窗口每 50ms 重试一次，最多 30 秒（游戏启动 / 建窗口需要时间），超时报错。
/// 返回 child_hwnd（i64）。
#[tauri::command]
pub fn attach_game_window(
    window: tauri::Window,
    pid: u32,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> RcResultWith<i64> {
    #[cfg(target_os = "windows")]
    {
        win::attach(window, pid, x, y, width, height)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, pid, x, y, width, height);
        Err(unsupported())
    }
}

/// 编辑器分栏变了 / 窗口被拖动：把游戏窗口重新摆到新的客户区 rect。
#[tauri::command]
pub fn move_game_window(x: i32, y: i32, width: i32, height: i32) -> RcResult {
    #[cfg(target_os = "windows")]
    {
        win::move_to(x, y, width, height)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (x, y, width, height);
        Err(unsupported())
    }
}

/// 解除：还原游戏窗口的样式 / owner / 原始位置。幂等（没嵌入时直接成功）。
#[tauri::command]
pub fn detach_game_window() -> RcResult {
    #[cfg(target_os = "windows")]
    {
        win::detach()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(unsupported())
    }
}

/// 切换「可交互」：true = 鼠标键盘交给游戏（并把前台给它），false = 只看不碰（前台还给编辑器）。
#[tauri::command]
pub fn set_game_window_interactive(interactive: bool) -> RcResult {
    #[cfg(target_os = "windows")]
    {
        win::set_interactive(interactive)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = interactive;
        Err(unsupported())
    }
}

/// 查询当前嵌入状态（有没有、pid、hwnd、焦点、客户区 rect）。
#[tauri::command]
pub fn game_window_info() -> RcResultWith<GameWindowInfo> {
    #[cfg(target_os = "windows")]
    {
        win::info()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(GameWindowInfo::default())
    }
}

#[cfg(target_os = "windows")]
mod win {
    use super::GameWindowInfo;
    use crate::common::exception::{RcError, RcResult, RcResultWith};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Mutex, MutexGuard};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetClassNameW, GetForegroundWindow, GetGUIThreadInfo,
        GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow,
        IsWindowVisible, SetForegroundWindow, SetLayeredWindowAttributes, SetWindowLongPtrW,
        SetWindowPos, ShowWindow, GUITHREADINFO, GWL_EXSTYLE, GWL_STYLE, GWLP_HWNDPARENT, GW_OWNER,
        HWND_TOP, LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
        WS_CAPTION, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
        WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    /// 游戏主窗口的窗口类名（spike 实测，固定值）
    const GAME_WINDOW_CLASS: &str = "Ballance";
    /// 摆位时要剥掉的顶层样式（剥完是**无边框顶层窗口**，不是子窗口）
    const STRIP_STYLE: u32 =
        WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
    /// 「只看不碰」时加的扩展样式：点击穿透（LAYERED + TRANSPARENT）+ 不会被激活
    const PASSIVE_EX: u32 = WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE;
    /// 找窗口：每 50ms 一次，最多 30s
    const FIND_INTERVAL: Duration = Duration::from_millis(50);
    const FIND_TIMEOUT: Duration = Duration::from_secs(30);
    /// 看门狗节奏
    const WATCH_INTERVAL: Duration = Duration::from_millis(300);

    /// 嵌入记录。
    ///
    /// hwnd 存 `isize` 而不是 `HWND`：`windows-sys` 的 `HWND` 是裸指针（`*mut c_void`），
    /// 不是 `Send`，塞进 `static Mutex<..>` 会让整个 static 不 `Sync`。
    struct Embedded {
        pid: u32,
        child: isize,
        /// 编辑器（Tauri）窗口：游戏窗口的 **owner**，也是坐标换算的基准
        host: isize,
        orig_style: isize,
        orig_ex_style: isize,
        orig_owner: isize,
        orig_rect: RECT,
        /// 当前期望的**客户区** rect：(x, y, width, height)，相对编辑器客户区
        rect: [i32; 4],
        /// 可交互（鼠标键盘交给游戏）；默认 false = 只看不碰
        interactive: bool,
    }

    static STATE: Mutex<Option<Embedded>> = Mutex::new(None);
    /// 看门狗停止标志：attach 前清零，detach 时置位
    static STOP: AtomicBool = AtomicBool::new(false);
    /// 看门狗世代号：每次 attach/detach +1；看门狗发现自己的世代号变了就退出
    /// （防止 detach→attach 之后新旧两个看门狗同时跑）
    static EPOCH: AtomicU64 = AtomicU64::new(0);
    /// 让「看门狗纠正」与「detach / move」互斥，保证 detach 的还原是最后一次动作
    static HEAL_LOCK: Mutex<()> = Mutex::new(());

    fn state() -> MutexGuard<'static, Option<Embedded>> {
        STATE.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn heal_lock() -> MutexGuard<'static, ()> {
        HEAL_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn as_hwnd(v: isize) -> HWND {
        v as HWND
    }

    /// 顶层样式 → **无边框顶层**样式（只剥装饰，不加 `WS_CHILD`）
    fn make_bare_style(orig_style: isize) -> isize {
        ((orig_style as u32) & !STRIP_STYLE) as isize
    }

    /// 期望的扩展样式：总是 TOOLWINDOW（不进任务栏 / Alt+Tab）；只看不碰时再加 PASSIVE_EX
    fn want_ex_style(cur_ex: u32, interactive: bool) -> u32 {
        let ex = cur_ex | WS_EX_TOOLWINDOW;
        if interactive {
            ex & !PASSIVE_EX
        } else {
            ex | PASSIVE_EX
        }
    }

    // ---------------------------------------------------------------- Win32 小工具

    /// 把前台交给 `target`。普通的 SetForegroundWindow 会被前台锁拦下（游戏刚启动时自己抢了
    /// 前台，我们这个进程已经不是前台进程），所以先把本线程的输入队列挂到当前前台线程上。
    unsafe fn give_foreground(target: HWND) {
        let fg = GetForegroundWindow();
        if fg == target {
            return;
        }
        let me = GetCurrentThreadId();
        let fg_thread = if fg.is_null() {
            0
        } else {
            GetWindowThreadProcessId(fg, std::ptr::null_mut())
        };
        let attached =
            fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, 1) != 0;
        BringWindowToTop(target);
        SetForegroundWindow(target);
        if attached {
            AttachThreadInput(me, fg_thread, 0);
        }
    }

    struct FindCtx {
        pid: u32,
        /// 我们自己设的 owner（编辑器窗口）：找回已被我们接管过的游戏窗口时用
        host: isize,
        found: isize,
    }

    unsafe extern "system" fn find_proc(hwnd: HWND, lparam: LPARAM) -> i32 {
        let ctx = &mut *(lparam as *mut FindCtx);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == ctx.pid {
            let mut buf = [0u16; 64];
            let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            let class = if len > 0 {
                String::from_utf16_lossy(&buf[..len as usize])
            } else {
                String::new()
            };
            let owner = GetWindow(hwnd, GW_OWNER);
            let owner_ok = owner.is_null() || owner as isize == ctx.host;
            if class == GAME_WINDOW_CLASS && owner_ok && IsWindowVisible(hwnd) != 0 {
                ctx.found = hwnd as isize;
                return 0; // 找到就停止枚举
            }
        }
        1
    }

    /// pid 的 Ballance 主窗口（类名 `Ballance`、无 owner 或 owner 是我们、已可见）；没有则返回 0
    unsafe fn find_game_window(pid: u32, host: isize) -> isize {
        let mut ctx = FindCtx {
            pid,
            host,
            found: 0,
        };
        EnumWindows(Some(find_proc), &mut ctx as *mut FindCtx as LPARAM);
        ctx.found
    }

    /// 每 50ms 找一次，最多 30s。必须等游戏把窗口显示出来再动手（见模块头注释第 1 条）。
    unsafe fn wait_for_game_window(pid: u32, host: isize) -> RcResultWith<isize> {
        let started = Instant::now();
        loop {
            let found = find_game_window(pid, host);
            if found != 0 {
                return Ok(found);
            }
            if started.elapsed() >= FIND_TIMEOUT {
                return Err(RcError::Other(format!(
                    "timed out after {}s waiting for the Ballance window of pid {}",
                    FIND_TIMEOUT.as_secs(),
                    pid
                )));
            }
            std::thread::sleep(FIND_INTERVAL);
        }
    }

    /// 当前前台线程里拥有键盘焦点的窗口是不是 child
    unsafe fn is_focused(child: HWND) -> bool {
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        GetGUIThreadInfo(0, &mut info) != 0 && info.hwndFocus == child
    }

    /// 编辑器客户区 (x,y) → 屏幕坐标（量不出来时就当原样）
    unsafe fn screen_pos(host: HWND, rect: &[i32; 4]) -> (i32, i32) {
        let mut origin = POINT {
            x: rect[0],
            y: rect[1],
        };
        if ClientToScreen(host, &mut origin) == 0 {
            (rect[0], rect[1])
        } else {
            (origin.x, origin.y)
        }
    }

    /// 游戏窗口是不是正好在「编辑器客户区 rect」对应的屏幕位置上、且尺寸是客户区尺寸
    /// （无边框窗口 → 窗口 rect == 客户区 rect）
    unsafe fn window_matches(child: HWND, host: HWND, rect: &[i32; 4]) -> bool {
        let (sx, sy) = screen_pos(host, rect);
        let mut cur = RECT::default();
        if GetWindowRect(child, &mut cur) == 0 {
            return true;
        }
        cur.left == sx
            && cur.top == sy
            && cur.right - cur.left == rect[2]
            && cur.bottom - cur.top == rect[3]
    }

    /// 施加摆位状态（幂等）：无边框样式 + owner = 编辑器 + 摆到「编辑器客户区 rect」的屏幕位置。
    /// attach、move、看门狗纠正共用这一段。
    unsafe fn place(child: HWND, host: HWND, orig_style: isize, rect: &[i32; 4], interactive: bool) {
        let want_style = make_bare_style(orig_style) as u32;
        let cur_style = GetWindowLongPtrW(child, GWL_STYLE) as u32;
        let mut changed = false;
        if (cur_style ^ want_style) & STRIP_STYLE != 0 {
            SetWindowLongPtrW(child, GWL_STYLE, want_style as isize);
            changed = true;
        }
        let cur_ex = GetWindowLongPtrW(child, GWL_EXSTYLE) as u32;
        let want_ex = want_ex_style(cur_ex, interactive);
        if cur_ex != want_ex {
            SetWindowLongPtrW(child, GWL_EXSTYLE, want_ex as isize);
            if want_ex & WS_EX_LAYERED != 0 && cur_ex & WS_EX_LAYERED == 0 {
                // 分层窗口必须给一次属性才会显示；alpha 255 = 完全不透明，画面不变
                SetLayeredWindowAttributes(child, 0, 255, LWA_ALPHA);
            }
            changed = true;
        }
        if GetWindow(child, GW_OWNER) != host {
            // 顶层窗口设 owner（不是 SetParent；不用改样式）
            SetWindowLongPtrW(child, GWLP_HWNDPARENT, host as isize);
            changed = true;
        }
        if IsIconic(child) != 0 {
            ShowWindow(child, SW_RESTORE);
        }
        let (sx, sy) = screen_pos(host, rect);
        let mut flags = SWP_NOACTIVATE | SWP_SHOWWINDOW;
        if changed {
            flags |= SWP_FRAMECHANGED;
        }
        SetWindowPos(child, HWND_TOP, sx, sy, rect[2], rect[3], flags);
        ShowWindow(child, SW_SHOW);
    }

    // ---------------------------------------------------------------- 命令实现

    pub fn attach(
        window: tauri::Window,
        pid: u32,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> RcResultWith<i64> {
        let host = window.hwnd()?.0 as isize;
        if host == 0 {
            return Err(RcError::Other("host window has no native handle".into()));
        }

        // 上一轮嵌入如果还在（游戏没退）→ 先解除，避免两个游戏窗口抢同一块区域、也避免
        // 残留状态把新流程卡住（踩过：残留时宿主窗口被停到屏幕外，然后永远「等它出画面」）。
        // 游戏已经自己退出了 → 直接清状态。
        {
            let stale = {
                let g = state();
                g.as_ref().map(|e| (e.child, unsafe { IsWindow(as_hwnd(e.child)) } != 0))
            };
            if let Some((child, alive)) = stale {
                if alive {
                    log::warn!(
                        "attach called while game window {child:#x} is still embedded; detaching it first"
                    );
                } else {
                    log::warn!("Stale embed state found (game window {child:#x} is gone); cleaning it up");
                }
                let _ = detach();
            }
        }

        let child_isize = unsafe { wait_for_game_window(pid, host)? };
        let child = as_hwnd(child_isize);
        let host_hwnd = as_hwnd(host);
        let rect = [x, y, width, height];

        let (orig_style, orig_ex_style, orig_owner, orig_rect) = unsafe {
            let orig_style = GetWindowLongPtrW(child, GWL_STYLE);
            let orig_ex_style = GetWindowLongPtrW(child, GWL_EXSTYLE);
            let orig_owner = GetWindow(child, GW_OWNER) as isize;
            let mut orig_rect = RECT::default();
            GetWindowRect(child, &mut orig_rect);
            if IsIconic(child) != 0 {
                ShowWindow(child, SW_RESTORE);
            }
            place(child, host_hwnd, orig_style, &rect, false);
            // 游戏刚启动时把前台抢走了：还给编辑器，DirectInput 随之释放鼠标
            give_foreground(host_hwnd);
            (orig_style, orig_ex_style, orig_owner, orig_rect)
        };

        let (sx, sy) = unsafe { screen_pos(host_hwnd, &rect) };
        log::info!(
            "Placed Ballance window {child_isize:#x} (pid {pid}) over editor {host:#x} at screen \
             ({sx},{sy}) {width}x{height} [editor client ({x},{y})]: style {orig_style:#x} -> {:#x}, \
             ex {orig_ex_style:#x} -> {:#x}, original owner {orig_owner:#x}, original rect \
             ({},{})-({},{})",
            make_bare_style(orig_style),
            want_ex_style(orig_ex_style as u32, false),
            orig_rect.left,
            orig_rect.top,
            orig_rect.right,
            orig_rect.bottom,
        );

        {
            let mut g = state();
            *g = Some(Embedded {
                pid,
                child: child_isize,
                host,
                orig_style,
                orig_ex_style,
                orig_owner,
                orig_rect,
                rect,
                interactive: false,
            });
        }

        STOP.store(false, Ordering::SeqCst);
        let my_epoch = EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::spawn(move || watchdog(my_epoch));

        Ok(child_isize as i64)
    }

    pub fn move_to(x: i32, y: i32, width: i32, height: i32) -> RcResult {
        let rect = [x, y, width, height];
        // 持锁期间只读写状态，Win32 调用都在锁外（看门狗同样先抢 HEAL_LOCK 再读状态）
        let _heal = heal_lock();
        let (child, host, orig_style, interactive) = {
            let mut g = state();
            let Some(e) = g.as_mut() else {
                return Err(RcError::Other("no game window is embedded".into()));
            };
            e.rect = rect;
            (as_hwnd(e.child), as_hwnd(e.host), e.orig_style, e.interactive)
        };

        unsafe { place(child, host, orig_style, &rect, interactive) };
        log::debug!("Moved game window to ({x},{y}) {width}x{height}");

        Ok(())
    }

    pub fn set_interactive(interactive: bool) -> RcResult {
        let _heal = heal_lock();
        let (child, host, orig_style, rect) = {
            let mut g = state();
            let Some(e) = g.as_mut() else {
                return Err(RcError::Other("no game window is embedded".into()));
            };
            e.interactive = interactive;
            (as_hwnd(e.child), as_hwnd(e.host), e.orig_style, e.rect)
        };
        unsafe {
            place(child, host, orig_style, &rect, interactive);
            give_foreground(if interactive { child } else { host });
        }
        log::info!(
            "Game window is now {}",
            if interactive { "interactive" } else { "view-only" }
        );
        Ok(())
    }

    pub fn detach() -> RcResult {
        STOP.store(true, Ordering::SeqCst);
        EPOCH.fetch_add(1, Ordering::SeqCst); // 让当前看门狗退出
        // 等看门狗这一轮做完再还原，保证还原是最后一次动作
        let _heal = heal_lock();
        let taken = { state().take() };
        let Some(e) = taken else {
            return Ok(()); // 没嵌入 → 幂等成功
        };

        let child = as_hwnd(e.child);
        unsafe {
            if IsWindow(child) == 0 {
                log::info!(
                    "Detach: game window {:#x} (pid {}) is already gone",
                    e.child,
                    e.pid
                );
                return Ok(());
            }

            let width = e.orig_rect.right - e.orig_rect.left;
            let height = e.orig_rect.bottom - e.orig_rect.top;
            SetWindowLongPtrW(child, GWL_STYLE, e.orig_style);
            SetWindowLongPtrW(child, GWL_EXSTYLE, e.orig_ex_style);
            SetWindowLongPtrW(child, GWLP_HWNDPARENT, e.orig_owner);
            SetWindowPos(
                child,
                HWND_TOP,
                e.orig_rect.left,
                e.orig_rect.top,
                width,
                height,
                SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            // owner 被最小化时 owned window 会自动隐藏 → 解除时补一次 show
            ShowWindow(child, SW_SHOW);

            log::info!(
                "Detached Ballance window {:#x} (pid {}): style restored to {:#x}, ex {:#x}, owner \
                 {:#x}, rect ({},{}) {width}x{height}",
                e.child,
                e.pid,
                e.orig_style,
                e.orig_ex_style,
                e.orig_owner,
                e.orig_rect.left,
                e.orig_rect.top,
            );
        }

        Ok(())
    }

    pub fn info() -> RcResultWith<GameWindowInfo> {
        let snap = {
            let g = state();
            g.as_ref().map(|e| (e.pid, e.child, e.rect, e.interactive))
        };
        let Some((pid, child, rect, interactive)) = snap else {
            return Ok(GameWindowInfo::default());
        };

        let focused = unsafe {
            let hwnd = as_hwnd(child);
            IsWindow(hwnd) != 0 && is_focused(hwnd)
        };

        Ok(GameWindowInfo {
            attached: true,
            pid,
            hwnd: child as i64,
            focused,
            interactive,
            rect,
        })
    }

    // ---------------------------------------------------------------- 看门狗

    /// 每 300ms 检查一次，处理两件事：游戏关掉了 / 窗口漂移了（Alt+Enter 全屏、分栏改了、
    /// 编辑器窗口被拖动）。只读 STATE 的快照，Win32 调用都在锁外。
    fn watchdog(my_epoch: u64) {
        loop {
            if STOP.load(Ordering::SeqCst) || EPOCH.load(Ordering::SeqCst) != my_epoch {
                break;
            }
            std::thread::sleep(WATCH_INTERVAL);
            if STOP.load(Ordering::SeqCst) || EPOCH.load(Ordering::SeqCst) != my_epoch {
                break;
            }

            let _heal = heal_lock();
            if STOP.load(Ordering::SeqCst) {
                break;
            }

            let snap = {
                let g = state();
                g.as_ref()
                    .map(|e| (e.child, e.host, e.orig_style, e.rect, e.interactive))
            };
            let Some((child_raw, host_raw, orig_style, rect, interactive)) = snap else {
                break; // 状态被清掉了（detach）
            };
            let child = as_hwnd(child_raw);
            let host = as_hwnd(host_raw);

            unsafe {
                if IsWindow(child) == 0 {
                    log::info!(
                        "Game window {child_raw:#x} is gone (game closed); clearing embed state"
                    );
                    *state() = None;
                    break;
                }

                let cur_style = GetWindowLongPtrW(child, GWL_STYLE) as u32;
                let want_style = make_bare_style(orig_style) as u32;
                let cur_ex = GetWindowLongPtrW(child, GWL_EXSTYLE) as u32;
                let drifted = IsIconic(child) != 0
                    || (cur_style ^ want_style) & STRIP_STYLE != 0
                    || cur_ex != want_ex_style(cur_ex, interactive)
                    || GetWindow(child, GW_OWNER) != host
                    || !window_matches(child, host, &rect);

                if drifted {
                    log::warn!(
                        "Game window drifted from its placed state (style {cur_style:#x}, owner \
                         {:#x}): re-applying bare style / owner / rect ({},{}) {}x{}",
                        GetWindow(child, GW_OWNER) as isize,
                        rect[0],
                        rect[1],
                        rect[2],
                        rect[3],
                    );
                    place(child, host, orig_style, &rect, interactive);
                }

                // 只看不碰时游戏又抢回了前台（关卡载入、它自己 SetForegroundWindow 之类）→ 还回去，
                // 否则 DirectInput 又会把鼠标吃掉
                if !interactive && GetForegroundWindow() == child {
                    log::info!("Game window took the foreground while view-only; handing it back");
                    give_foreground(host);
                }
            }
        }
    }
}
