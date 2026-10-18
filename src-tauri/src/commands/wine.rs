//! Wine 运行时（macOS / Linux）：Ballance 是 32 位 Windows 游戏，其它平台靠 Wine 跑。
//!
//! - 运行时：优先用用户指定的（`<app data>/wine/config.json`），其次是启动器自己装的
//!   （`<app data>/wine/runtime`，下载 Gcenx 的 macOS 构建），再次是 Ballance.app 自带的
//!   （放在哪都行，Spotlight 按 bundle id 找），最后是 WineHQ 的 Wine Devel/Staging/Stable.app。
//!   本机已经有 Ballance.app 时前端就不会提示下载。
//! - 前缀：`<app data>/wine/prefix`，所有游戏实例共用；用的是 Ballance.app 的 Wine 时
//!   直接共用 Ballance.app 的前缀。第一次用（或换了 Wine）时跑 wineboot，再写入游戏需要的
//!   注册表项（见 PREFIX_REGISTRY），记录在 `.rockoon-prefix.json`。
//! - 安装：与原版游戏安装同一套做法 —— 起线程下载 + 解压 + 初始化前缀，进度与结果走
//!   `game-install:*` 事件，取消也用 `cancel_game_install`（取消表按任务 id 共享）。
//!
//! Windows 上这些命令都还在（前端统一调用），但 `wine_status().required` 为 false，其余是空实现。

use crate::common::exception::{RcError, RcResult, RcResultWith};
use serde::Serialize;
use tauri::{command, AppHandle};

#[derive(Serialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WineStatus {
    /// 这个平台要不要 Wine（Windows 上为 false，其余字段无意义）
    pub required: bool,
    /// 找到能用的 Wine 了吗
    pub installed: bool,
    /// 运行时来源：`custom`（用户指定）、`managed`（启动器装的）、`bundled`（Ballance.app 自带的）、
    /// `detected`（自动找到的其它 Wine）
    pub source: Option<String>,
    /// Wine 根目录（里面有 bin/wine）
    pub path: Option<String>,
    pub version: Option<String>,
    /// 前缀已经用当前 Wine 初始化好了吗（没好的话启动前要先 `prepare_wine_prefix`）
    pub prefix_ready: bool,
    pub prefix: Option<String>,
    /// Wine 是 x86_64 程序：Apple 芯片上需要 Rosetta 2
    pub rosetta: bool,
    /// 用户指定的 Wine（没指定为空）
    pub custom_path: Option<String>,
}

/// 把 unix 绝对路径换成 Wine 里的 Windows 路径（Wine 默认把 `/` 映射成 `Z:`）。
/// 不是绝对路径的原样返回 —— 启动参数里只有地图路径需要换，其它都是数字/开关。
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub fn to_windows_path(value: &str) -> String {
    if value.starts_with('/') {
        format!("Z:{}", value.replace('/', "\\"))
    } else {
        value.to_string()
    }
}

#[cfg(not(target_os = "windows"))]
pub use imp::game_command;

#[command(async)]
pub fn wine_status(app: AppHandle) -> RcResultWith<WineStatus> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        Ok(WineStatus::default())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(imp::status(&app))
    }
}

/// 一个 Wine 下载源；`sha256` 给了就校验
#[derive(serde::Deserialize, Clone, Debug)]
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub struct WineSource {
    pub url: String,
    pub sha256: Option<String>,
}

/// 安装 Wine 运行时：按顺序试 `sources`（一个下载失败或校验不过就换下一个），
/// 或者用本地压缩包 `archive`；装完顺带初始化前缀。
/// 立即返回任务 id，进度和结果走 `game-install:*` 事件。
#[command(async)]
pub fn start_wine_install(
    app: AppHandle,
    sources: Option<Vec<WineSource>>,
    archive: Option<String>,
) -> RcResultWith<String> {
    #[cfg(target_os = "windows")]
    {
        let _ = (app, sources, archive);
        Err(RcError::Other("Windows 不需要 Wine".into()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::start_install(app, sources.unwrap_or_default(), archive)
    }
}

/// 确保前缀已经用当前 Wine 初始化（第一次大约 20 秒）。启动游戏前调用。
#[command(async)]
pub fn prepare_wine_prefix(app: AppHandle) -> RcResultWith<WineStatus> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        Ok(WineStatus::default())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let root = imp::resolve(&app)
            .map(|(root, _)| root)
            .ok_or_else(|| RcError::Other("还没有安装 Wine 运行环境".into()))?;
        imp::ensure_prefix(&app, &root)?;
        Ok(imp::status(&app))
    }
}

/// 删掉前缀重建（游戏打不开、注册表被改乱时用）。游戏文件不在前缀里，不受影响。
#[command(async)]
pub fn reset_wine_prefix(app: AppHandle) -> RcResultWith<WineStatus> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        Ok(WineStatus::default())
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::reset_prefix(&app)?;
        Ok(imp::status(&app))
    }
}

/// 指定已有的 Wine（.app、Wine 根目录或 bin/wine 都行）；传空恢复默认。
#[command(async)]
pub fn set_custom_wine(app: AppHandle, path: Option<String>) -> RcResultWith<WineStatus> {
    #[cfg(target_os = "windows")]
    {
        let _ = (app, path);
        Ok(WineStatus::default())
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::set_custom(&app, path)?;
        Ok(imp::status(&app))
    }
}

/// 打开 winecfg（高级：调声音/显示等 Wine 设置）
#[command(async)]
pub fn open_wine_config(app: AppHandle) -> RcResult {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::open_config(&app)
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::{WineSource, WineStatus};
    use crate::commands::game::{download_to, emit_progress, fail, succeed, unique_id, CANCEL_MAP};
    use crate::common::exception::{RcError, RcResult, RcResultWith};
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::Read;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use tauri::path::BaseDirectory;
    use tauri::{AppHandle, Emitter, Manager};

    /// 前缀里要写的注册表项。改了这张表要把 PREFIX_REVISION 加一，已有前缀才会补写；
    /// Ballance.app 的启动器（CHHC-L/ballance-mac-bundle 的 template/launcher.sh）写的是同一张表，两边要一起改。
    ///
    /// - EmulateModeset：Wine 在 Mac 上只报告显示器自身的分辨率（没有 1024×768 之类的 4:3 模式），
    ///   Player 找不到配置里的分辨率就进不了游戏；打开后 Wine 会模拟出标准分辨率列表。
    /// - Left/RightOptionIsAlt：Wine 默认把 Option 留给 macOS 输入特殊字符，
    ///   Player 的 Alt+F4（退出）、Alt+Enter（全屏）、Alt+C（设置）就都按不出来。
    const PREFIX_REGISTRY: &[(&str, &str, &str)] = &[
        (r"HKCU\Software\Wine\X11 Driver", "EmulateModeset", "Y"),
        (r"HKCU\Software\Wine\Mac Driver", "LeftOptionIsAlt", "y"),
        (r"HKCU\Software\Wine\Mac Driver", "RightOptionIsAlt", "y"),
    ];
    const PREFIX_REVISION: u32 = 2;

    /// Ballance.app（https://github.com/CHHC-L/ballance-mac-bundle 打包的独立版，自带 Wine + 游戏）的 bundle id
    const BALLANCE_APP_ID: &str = "io.github.chhc-l.ballance";

    /// 自动查找的其它现成 Wine（相对 / 或 ~ 的路径）
    const DETECT_CANDIDATES: &[&str] = &[
        "Applications/Wine Devel.app/Contents/Resources/wine",
        "Applications/Wine Staging.app/Contents/Resources/wine",
        "Applications/Wine Stable.app/Contents/Resources/wine",
    ];

    /// 首次初始化 / 补写注册表不能并发跑（安装任务与启动游戏可能同时要前缀）
    static PREFIX_LOCK: Mutex<()> = Mutex::new(());

    #[derive(serde::Serialize, serde::Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct WineConfig {
        custom_path: Option<String>,
    }

    #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
    #[serde(rename_all = "camelCase")]
    struct PrefixMarker {
        wine_version: String,
        revision: u32,
    }

    fn data_dir(app: &AppHandle) -> PathBuf {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("rockoon"))
            .join("wine")
    }

    fn managed_root(app: &AppHandle) -> PathBuf {
        data_dir(app).join("runtime")
    }

    fn home() -> PathBuf {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
    }

    /// `root` 是 Ballance.app 自带的 Wine 时，返回 Ballance.app 的前缀。
    /// 用它的 Wine 就连前缀一起共用（目录约定见 Ballance.app 的 Contents/MacOS/Ballance），
    /// 这样一台 Mac 上只有一套 Wine 环境。
    fn bundled_prefix(root: &Path) -> Option<PathBuf> {
        if !root.parent()?.join("bundle.env").is_file() {
            return None;
        }
        let data = std::env::var_os("BALLANCE_DATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home().join("Library/Application Support/Ballance"));
        Some(data.join("prefix"))
    }

    fn prefix_dir(app: &AppHandle, root: &Path) -> PathBuf {
        bundled_prefix(root).unwrap_or_else(|| data_dir(app).join("prefix"))
    }

    /// 找 Ballance.app 自带的 Wine：先看「应用程序」，不在那儿（还在下载目录、或者挪了位置）就问 Spotlight
    fn find_bundled() -> Option<PathBuf> {
        let fixed = [
            PathBuf::from("/Applications/Ballance.app"),
            home().join("Applications/Ballance.app"),
        ];
        let spotlight = || {
            Command::new("/usr/bin/mdfind")
                .arg(format!("kMDItemCFBundleIdentifier == '{BALLANCE_APP_ID}'"))
                .stdin(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .map(|out| {
                    String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .map(PathBuf::from)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        };
        let usable = |app: &PathBuf| {
            let root = app.join("Contents/Resources/wine");
            root.join("bin/wine").is_file().then_some(root)
        };
        fixed
            .iter()
            .find_map(usable)
            .or_else(|| spotlight().iter().find_map(usable))
    }

    fn log_path(app: &AppHandle) -> PathBuf {
        let dir = app.path().app_log_dir().unwrap_or_else(|_| data_dir(app));
        let _ = fs::create_dir_all(&dir);
        dir.join("wine.log")
    }

    fn read_config(app: &AppHandle) -> WineConfig {
        fs::read_to_string(data_dir(app).join("config.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// 用户给的路径可能是 .app、Wine 根目录或 bin/wine 本身，统一成「里面有 bin/wine 的目录」
    fn normalize_root(path: &Path) -> Option<PathBuf> {
        let candidates = [
            Some(path.to_path_buf()),
            Some(path.join("Contents/Resources/wine")),
            path.parent().and_then(Path::parent).map(Path::to_path_buf),
        ];
        candidates
            .into_iter()
            .flatten()
            .filter(|root| root.is_absolute())
            .find(|root| root.join("bin/wine").is_file())
    }

    /// 当前用哪个 Wine：用户指定 → 启动器装的 → Ballance.app 自带的 → 其它自动找到的
    pub fn resolve(app: &AppHandle) -> Option<(PathBuf, &'static str)> {
        if let Some(custom) = read_config(app).custom_path {
            // 指定的 Wine 不见了就别悄悄换成别的，让用户知道
            return normalize_root(Path::new(&custom)).map(|root| (root, "custom"));
        }
        let managed = managed_root(app);
        if managed.join("bin/wine").is_file() {
            return Some((managed, "managed"));
        }
        if let Some(root) = find_bundled() {
            return Some((root, "bundled"));
        }
        for rel in DETECT_CANDIDATES {
            for base in [PathBuf::from("/"), home()] {
                let root = base.join(rel);
                if root.join("bin/wine").is_file() {
                    return Some((root, "detected"));
                }
            }
        }
        None
    }

    /// `wine --version` 输出 `wine-11.18`（staging 版还带 ` (Staging)`）
    fn wine_version(root: &Path) -> Option<String> {
        let output = Command::new(root.join("bin/wine"))
            .arg("--version")
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let version = text.trim().trim_start_matches("wine-").to_string();
        (!version.is_empty()).then_some(version)
    }

    fn rosetta_ok() -> bool {
        if std::env::consts::ARCH != "aarch64" || std::env::consts::OS != "macos" {
            return true;
        }
        Command::new("/usr/bin/arch")
            .args(["-x86_64", "/usr/bin/true"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    fn read_marker(app: &AppHandle, root: &Path) -> Option<PrefixMarker> {
        let prefix = prefix_dir(app, root);
        if let Some(marker) = fs::read_to_string(prefix.join(".rockoon-prefix.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
        {
            return Some(marker);
        }
        // Ballance.app 先建好的共用前缀：它的标记是 `11.18 r2` 这样的「Wine 版本 + 注册表修订号」
        // （老版本启动器只写版本号，那是第 1 版）
        parse_ballance_marker(&fs::read_to_string(prefix.join(BALLANCE_MARKER)).ok()?)
    }

    fn parse_ballance_marker(text: &str) -> Option<PrefixMarker> {
        let mut parts = text.split_whitespace();
        let wine_version = parts.next()?.to_string();
        let revision = parts
            .next()
            .and_then(|r| r.strip_prefix('r')?.parse().ok())
            .unwrap_or(1);
        Some(PrefixMarker {
            wine_version,
            revision,
        })
    }

    /// Ballance.app 的启动器记录「前缀用哪个 Wine 版本、哪版注册表建的」的文件
    const BALLANCE_MARKER: &str = ".ballance-wine-version";

    fn expected_marker(root: &Path) -> PrefixMarker {
        PrefixMarker {
            wine_version: wine_version(root).unwrap_or_default(),
            revision: PREFIX_REVISION,
        }
    }

    pub fn status(app: &AppHandle) -> WineStatus {
        let resolved = resolve(app);
        let version = resolved.as_ref().and_then(|(root, _)| wine_version(root));
        let prefix = resolved.as_ref().map(|(root, _)| prefix_dir(app, root));
        let prefix_ready = match (&resolved, &version, &prefix) {
            (Some((root, _)), Some(v), Some(prefix)) => {
                read_marker(app, root).is_some_and(|marker| {
                    marker.wine_version == *v && marker.revision == PREFIX_REVISION
                }) && prefix.join("system.reg").is_file()
            }
            _ => false,
        };
        WineStatus {
            required: true,
            installed: resolved.is_some() && version.is_some(),
            source: resolved.as_ref().map(|(_, s)| s.to_string()),
            path: resolved.map(|(root, _)| root.to_string_lossy().to_string()),
            version,
            prefix_ready,
            prefix: prefix.map(|p| p.to_string_lossy().to_string()),
            rosetta: rosetta_ok(),
            custom_path: read_config(app).custom_path,
        }
    }

    /// 带好前缀与通用环境变量的 Wine 命令，输出写进 wine.log
    fn wine_command(app: &AppHandle, root: &Path, program: &str, append_log: bool) -> Command {
        let mut cmd = Command::new(root.join("bin").join(program));
        cmd.env("WINEPREFIX", prefix_dir(app, root))
            // 外面设了 WINEDEBUG（调试）就用外面的
            .env(
                "WINEDEBUG",
                std::env::var("WINEDEBUG").unwrap_or_else(|_| "-all".into()),
            )
            // 不装 Mono / Gecko（游戏用不到，初始化时也不会弹安装框）；不让 Wine 往系统里写菜单项
            .env("WINEDLLOVERRIDES", "mscoree,mshtml=;winemenubuilder.exe=d")
            .stdin(Stdio::null());
        let log = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append_log)
            .truncate(!append_log)
            .open(log_path(app));
        match log.and_then(|f| f.try_clone().map(|g| (f, g))) {
            Ok((out, err)) => {
                cmd.stdout(out).stderr(err);
            }
            Err(_) => {
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
        cmd
    }

    /// 游戏启动器（src-launcher/launch.c，打包在资源目录里）：在 Wine 里拉起游戏，
    /// 等游戏窗口出来才退出，期间游戏没起来就自动重试。
    ///
    /// 为什么需要：Apple 芯片上 32 位程序靠 Rosetta 2 跑，Wine 从 32 位切到 64 位的远跳转偶尔不生效，
    /// Player 初始化 Direct3D 时撞上访问违例 —— 报 “No render driver found” 退出，或者主线程没了、
    /// 进程吊着不退。冷启动时大约每两三次就会碰到一次，重来一次一般就好。
    fn launcher_path(app: &AppHandle) -> Option<PathBuf> {
        app.path()
            .resolve(
                "resources/wine/BallanceLauncher.exe",
                BaseDirectory::Resource,
            )
            .ok()
            .filter(|p| p.is_file())
    }

    /// 用 Wine 跑 `exe` 的命令（process::execute 调用）。第二个值表示是不是经过了游戏启动器：
    /// 是的话 Wine 进程会在游戏窗口出来后退出（退出码非 0 = 重试几次都没起来），
    /// 否则 Wine 进程一直活到游戏退出。前缀没准备好就报错，前端会先调 `prepare_wine_prefix`
    /// （这里不做：初始化要 20 秒）。
    pub fn game_command(app: &AppHandle, exe: &str) -> RcResultWith<(Command, bool)> {
        let Some((root, _)) = resolve(app) else {
            return Err(RcError::Other("还没有安装 Wine 运行环境".into()));
        };
        if !rosetta_ok() {
            return Err(RcError::Other(
                "需要 Rosetta 2：请在终端运行 softwareupdate --install-rosetta".into(),
            ));
        }
        if read_marker(app, &root) != Some(expected_marker(&root)) {
            return Err(RcError::Other("Wine 运行环境还没有初始化".into()));
        }
        let mut cmd = wine_command(app, &root, "wine", false);
        match launcher_path(app) {
            Some(launcher) => {
                // 启动器在 Wine 里用 CreateProcess 拉游戏，要的是 Windows 路径
                cmd.arg(launcher).arg(super::to_windows_path(exe));
                Ok((cmd, true))
            }
            None => {
                log::warn!("BallanceLauncher.exe is missing, starting the game directly");
                cmd.arg(exe);
                Ok((cmd, false))
            }
        }
    }

    fn run_logged(app: &AppHandle, root: &Path, program: &str, args: &[&str]) -> RcResult {
        let status = wine_command(app, root, program, true).args(args).status()?;
        if !status.success() {
            log::warn!("wine {program} {args:?} exited with {status}");
        }
        Ok(())
    }

    /// 前缀没初始化（或 Wine 换了、注册表表改了）就初始化 / 更新它
    pub fn ensure_prefix(app: &AppHandle, root: &Path) -> RcResult {
        let _guard = PREFIX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let expected = expected_marker(root);
        if expected.wine_version.is_empty() {
            return Err(RcError::Other(format!(
                "Wine 无法运行：{}",
                root.join("bin/wine").display()
            )));
        }
        let prefix = prefix_dir(app, root);
        if read_marker(app, root).as_ref() == Some(&expected) && prefix.join("system.reg").is_file()
        {
            return Ok(());
        }

        fs::create_dir_all(&prefix)?;
        let fresh = !prefix.join("system.reg").is_file();
        // 同一个 Wine、只是注册表表改了：补写注册表就行，不用再跑一遍 wineboot
        let same_wine = read_marker(app, root)
            .is_some_and(|marker| marker.wine_version == expected.wine_version);
        log::info!(
            "{} wine prefix {} with wine {} (registry r{})",
            if fresh { "Creating" } else { "Updating" },
            prefix.display(),
            expected.wine_version,
            PREFIX_REVISION
        );
        if fresh || !same_wine {
            run_logged(
                app,
                root,
                "wine",
                &["wineboot", if fresh { "--init" } else { "-u" }],
            )?;
        }
        for (key, name, value) in PREFIX_REGISTRY {
            run_logged(
                app,
                root,
                "wine",
                &[
                    "reg", "add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f",
                ],
            )?;
        }
        // 等 wineserver 把注册表写回磁盘再检查
        run_logged(app, root, "wineserver", &["-w"])?;
        if !prefix.join("system.reg").is_file() {
            return Err(RcError::Other(format!(
                "Wine 前缀初始化失败，详见日志：{}",
                log_path(app).display()
            )));
        }
        fs::write(
            prefix.join(".rockoon-prefix.json"),
            serde_json::to_string_pretty(&expected).unwrap_or_default(),
        )?;
        // 共用 Ballance.app 的前缀时也替它记一笔，免得它下次启动再初始化一遍
        if bundled_prefix(root).is_some() {
            fs::write(
                prefix.join(BALLANCE_MARKER),
                format!("{} r{}\n", expected.wine_version, PREFIX_REVISION),
            )?;
        }
        Ok(())
    }

    fn kill_wineserver(app: &AppHandle) {
        if let Some((root, _)) = resolve(app) {
            let _ = run_logged(app, &root, "wineserver", &["-k"]);
        }
    }

    pub fn reset_prefix(app: &AppHandle) -> RcResult {
        let root = resolve(app)
            .map(|(root, _)| root)
            .ok_or_else(|| RcError::Other("还没有安装 Wine 运行环境".into()))?;
        kill_wineserver(app);
        let prefix = prefix_dir(app, &root);
        if prefix.exists() {
            fs::remove_dir_all(&prefix)?;
        }
        ensure_prefix(app, &root)
    }

    pub fn set_custom(app: &AppHandle, path: Option<String>) -> RcResult {
        let path = path.filter(|p| !p.trim().is_empty());
        if let Some(p) = &path {
            if normalize_root(Path::new(p)).is_none() {
                return Err(RcError::Other(format!(
                    "这里没有找到 Wine（bin/wine）：{p}"
                )));
            }
        }
        let dir = data_dir(app);
        fs::create_dir_all(&dir)?;
        fs::write(
            dir.join("config.json"),
            serde_json::to_string_pretty(&WineConfig { custom_path: path }).unwrap_or_default(),
        )?;
        Ok(())
    }

    pub fn open_config(app: &AppHandle) -> RcResult {
        let root = resolve(app)
            .map(|(root, _)| root)
            .ok_or_else(|| RcError::Other("还没有安装 Wine 运行环境".into()))?;
        ensure_prefix(app, &root)?;
        let mut child = wine_command(app, &root, "wine", true)
            .arg("winecfg")
            .spawn()?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }

    pub fn start_install(
        app: AppHandle,
        sources: Vec<WineSource>,
        archive: Option<String>,
    ) -> RcResultWith<String> {
        if sources.is_empty() && archive.is_none() {
            return Err(RcError::Other("没有指定 Wine 的下载地址或压缩包".into()));
        }
        let id = unique_id();
        let flag = Arc::new(AtomicBool::new(false));
        CANCEL_MAP.lock().unwrap().insert(id.clone(), flag.clone());

        let id2 = id.clone();
        std::thread::spawn(move || {
            let result = install(&app, &id2, sources, archive, &flag);
            CANCEL_MAP.lock().unwrap().remove(&id2);
            let _ = app.emit("game-install:complete", result);
        });
        Ok(id)
    }

    fn sha256_file(path: &Path) -> std::io::Result<String> {
        let mut file = fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = file.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        Ok(format!("{:x}", hasher.finalize()))
    }

    /// 压缩包解开后找 Wine 根目录：Gcenx 的包是 `Wine Devel.app/Contents/Resources/wine`，
    /// 别的包可能直接是 `wine-xx/bin/wine`
    fn find_wine_root(dir: &Path, depth: u32) -> Option<PathBuf> {
        if dir.join("bin/wine").is_file() {
            return Some(dir.to_path_buf());
        }
        if depth == 0 {
            return None;
        }
        let mut entries: Vec<PathBuf> = fs::read_dir(dir)
            .ok()?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_dir())
            .collect();
        entries.sort();
        entries
            .into_iter()
            .find_map(|p| find_wine_root(&p, depth - 1))
    }

    /// `want` 给了就校验 sha256
    fn verify(path: &Path, want: Option<&str>) -> Result<(), String> {
        let Some(want) = want.filter(|s| !s.is_empty()) else {
            return Ok(());
        };
        match sha256_file(path) {
            Ok(got) if got.eq_ignore_ascii_case(want) => Ok(()),
            Ok(got) => Err(format!("文件校验失败（sha256 {got}），请重新下载")),
            Err(e) => Err(format!("读取压缩包失败：{e}")),
        }
    }

    fn install(
        app: &AppHandle,
        id: &str,
        sources: Vec<WineSource>,
        archive: Option<String>,
        cancel: &Arc<AtomicBool>,
    ) -> crate::commands::game::CompletePayload {
        let dir = data_dir(app);
        if let Err(e) = fs::create_dir_all(&dir) {
            return fail(id, format!("无法创建目录：{e}"));
        }

        // ── 下载（或用本地压缩包） ──────────────────────────────
        let downloaded_tmp = dir.join(format!(".download-{id}.tar.xz"));
        let (archive_path, size) = if let Some(local) = &archive {
            let path = PathBuf::from(local);
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            (path, size)
        } else {
            // 按顺序试下载源：第一个是 ballance-mac-bundle 发布的精简包，后面是原版构建兜底
            let mut downloaded = None;
            let mut last_error = fail(id, "没有指定 Wine 的下载地址或压缩包");
            for source in &sources {
                match download_to(app, id, &source.url, &downloaded_tmp, cancel) {
                    Ok(n) => {
                        emit_progress(app, id, "importing", 100, n, n);
                        match verify(&downloaded_tmp, source.sha256.as_deref()) {
                            Ok(()) => {
                                downloaded = Some(n);
                                break;
                            }
                            Err(msg) => {
                                log::warn!("Wine download {} rejected: {msg}", source.url);
                                let _ = fs::remove_file(&downloaded_tmp);
                                last_error = fail(id, msg);
                            }
                        }
                    }
                    Err(e) => {
                        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                            return e;
                        }
                        log::warn!(
                            "Wine download {} failed, trying the next source",
                            source.url
                        );
                        last_error = e;
                    }
                }
            }
            match downloaded {
                Some(n) => (downloaded_tmp.clone(), n),
                None => return last_error,
            }
        };
        let cleanup_download = || {
            let _ = fs::remove_file(&downloaded_tmp);
        };
        emit_progress(app, id, "importing", 100, size, size);

        // ── 解压到临时目录，确认能跑之后再换进来 ─────────────────
        let staging = dir.join(format!(".staging-{id}"));
        let _ = fs::remove_dir_all(&staging);
        if let Err(e) = fs::create_dir_all(&staging) {
            cleanup_download();
            return fail(id, format!("无法创建临时目录：{e}"));
        }
        let extracted = Command::new("tar")
            .arg("-xf")
            .arg(&archive_path)
            .arg("-C")
            .arg(&staging)
            .stdin(Stdio::null())
            .output();
        cleanup_download();
        let fail_cleanup = |msg: String| {
            let _ = fs::remove_dir_all(&staging);
            fail(id, msg)
        };
        match extracted {
            Ok(out) if out.status.success() => {}
            Ok(out) => {
                return fail_cleanup(format!(
                    "解压失败：{}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ))
            }
            Err(e) => return fail_cleanup(format!("解压失败：{e}")),
        }
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            return fail_cleanup("已取消".into());
        }
        let Some(found) = find_wine_root(&staging, 4) else {
            return fail_cleanup("压缩包里没有找到 Wine（bin/wine）".into());
        };
        if wine_version(&found).is_none() {
            return fail_cleanup("这个 Wine 在本机上运行不了（Apple 芯片需要 Rosetta 2）".into());
        }
        // Gecko（IE 内核）和 Mono（.NET）游戏都用不到，去掉能省 300 MB
        for unused in ["share/wine/gecko", "share/wine/mono"] {
            let _ = fs::remove_dir_all(found.join(unused));
        }

        // 换掉旧的运行时：先停掉可能还在跑的 wineserver
        let target = managed_root(app);
        if target.exists() {
            if let Some((root, "managed")) = resolve(app) {
                let _ = run_logged(app, &root, "wineserver", &["-k"]);
            }
            if let Err(e) = fs::remove_dir_all(&target) {
                return fail_cleanup(format!("无法替换旧的 Wine：{e}"));
            }
        }
        if let Err(e) = fs::rename(&found, &target) {
            return fail_cleanup(format!("安装 Wine 失败：{e}"));
        }
        let _ = fs::remove_dir_all(&staging);

        // ── 初始化前缀 ─────────────────────────────────────────
        // 用户另外指定了 Wine 的话，前缀按那个 Wine 初始化（启动游戏时用的也是它）
        emit_progress(app, id, "initializing", 100, size, size);
        let root = resolve(app).map(|(root, _)| root).unwrap_or(target.clone());
        if let Err(e) = ensure_prefix(app, &root) {
            return fail(id, format!("Wine 已安装，但前缀初始化失败：{e}"));
        }

        succeed(app, id, size, &target)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn reads_ballance_app_markers() {
            let marker = |v: &str, r| {
                Some(PrefixMarker {
                    wine_version: v.into(),
                    revision: r,
                })
            };
            assert_eq!(parse_ballance_marker("11.18\n"), marker("11.18", 1));
            assert_eq!(parse_ballance_marker("11.18 r2\n"), marker("11.18", 2));
            assert_eq!(parse_ballance_marker(""), None);
        }

        #[test]
        fn shares_prefix_only_with_ballance_app() {
            let dir = std::env::temp_dir().join("rockoon-wine-test-bundled");
            let _ = fs::remove_dir_all(&dir);
            let res = dir.join("Ballance.app/Contents/Resources");
            fs::create_dir_all(res.join("wine/bin")).unwrap();
            assert_eq!(bundled_prefix(&res.join("wine")), None);
            fs::write(res.join("bundle.env"), b"WINE_VERSION=11.18\n").unwrap();
            let prefix = bundled_prefix(&res.join("wine")).unwrap();
            assert!(prefix.ends_with("Ballance/prefix"));
            let _ = fs::remove_dir_all(&dir);
        }

        #[test]
        fn finds_root_inside_app_bundle_layout() {
            let dir = std::env::temp_dir().join("rockoon-wine-test-layout");
            let _ = fs::remove_dir_all(&dir);
            let root = dir.join("Wine Devel.app/Contents/Resources/wine");
            fs::create_dir_all(root.join("bin")).unwrap();
            fs::write(root.join("bin/wine"), b"").unwrap();
            assert_eq!(find_wine_root(&dir, 4), Some(root.clone()));
            assert_eq!(
                normalize_root(&dir.join("Wine Devel.app")),
                Some(root.clone())
            );
            assert_eq!(normalize_root(&root.join("bin/wine")), Some(root.clone()));
            assert_eq!(normalize_root(&dir), None);
            let _ = fs::remove_dir_all(&dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::to_windows_path;

    #[test]
    fn converts_absolute_paths_only() {
        assert_eq!(
            to_windows_path("/Users/me/Ballance/Maps/My Map.nmo"),
            r"Z:\Users\me\Ballance\Maps\My Map.nmo"
        );
        assert_eq!(to_windows_path("1"), "1");
        assert_eq!(
            to_windows_path(r"C:\already\windows"),
            r"C:\already\windows"
        );
    }
}
