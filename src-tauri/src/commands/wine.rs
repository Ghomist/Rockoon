//! Wine 运行时（macOS / Linux）：Ballance 是 32 位 Windows 游戏，其它平台靠 Wine 跑。
//!
//! - 运行时：Wine 随启动器一起打包 —— 构建时 `scripts/fetch-wine.mjs` 把 Gcenx 的 macOS 构建
//!   精简后压成 `resources-macos/wine/wine-runtime.tar.xz`（附 `runtime.json` 记版本与 sha256），
//!   第一次用时解到 `<app data>/wine/runtime`。运行时不联网；启动器升级带了新的 Wine 就重新解一次。
//!   用户也可以指定一个已有的 Wine（`<app data>/wine/config.json`），指定了就优先用它。
//! - 前缀：`<app data>/wine/prefix`，所有游戏实例共用。第一次用（或换了 Wine）时跑 wineboot，
//!   再写入游戏需要的注册表项（见 PREFIX_REGISTRY），记录在 `.rockoon-prefix.json`。
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
    /// 找到能用的 Wine 了吗（启动器自带的还没解出来、或者是旧版本时为 false）
    pub installed: bool,
    /// 运行时来源：`builtin`（启动器自带的）、`custom`（用户指定）
    pub source: Option<String>,
    /// Wine 根目录（里面有 bin/wine）
    pub path: Option<String>,
    pub version: Option<String>,
    /// 启动器自带的 Wine 版本（构建时没打包 Wine 为空）
    pub bundled_version: Option<String>,
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

/// 把启动器自带的 Wine 解到数据目录（已经是这个版本就跳过；`reinstall` 为 true 时重新解），
/// 再初始化前缀。不联网，第一次大约半分钟。阶段变化发 `wine-install:phase` 事件
/// （`importing` 解压、`initializing` 初始化前缀）。
#[command(async)]
pub fn install_wine(app: AppHandle, reinstall: Option<bool>) -> RcResultWith<WineStatus> {
    #[cfg(target_os = "windows")]
    {
        let _ = (app, reinstall);
        Err(RcError::Other("Windows 不需要 Wine".into()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::install(&app, reinstall.unwrap_or(false))?;
        Ok(imp::status(&app))
    }
}

/// 安装 Rosetta 2（Apple 芯片上跑 Wine 要用）：弹系统的管理员密码框，从 Apple 下载安装
#[command(async)]
pub fn install_rosetta() -> RcResult {
    #[cfg(target_os = "windows")]
    {
        Err(RcError::Other("Windows 不需要 Rosetta".into()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        imp::install_rosetta()
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
    use super::WineStatus;
    use crate::common::exception::{RcError, RcResult, RcResultWith};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::sync::Mutex;
    use tauri::path::BaseDirectory;
    use tauri::{AppHandle, Emitter, Manager};

    /// 前缀里要写的注册表项。改了这张表要把 PREFIX_REVISION 加一，已有前缀才会补写。
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

    /// 打包在资源目录里的 Wine（scripts/fetch-wine.mjs 生成）
    const BUNDLED_ARCHIVE: &str = "resources-macos/wine/wine-runtime.tar.xz";
    const BUNDLED_MANIFEST: &str = "resources-macos/wine/runtime.json";
    /// 解出来的 Wine 里记「是从哪个压缩包解的」，和 BUNDLED_MANIFEST 对不上就要重新解
    const RUNTIME_MARKER: &str = ".rockoon-runtime.json";

    /// 首次初始化 / 补写注册表不能并发跑（安装任务与启动游戏可能同时要前缀）
    static PREFIX_LOCK: Mutex<()> = Mutex::new(());
    /// 解压也不能并发（装原版游戏时会顺带解，用户可能同时点了启动）
    static INSTALL_LOCK: Mutex<()> = Mutex::new(());

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

    /// `runtime.json`：自带的 Wine 是哪个版本、压缩包的 sha256
    #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
    struct RuntimeManifest {
        version: String,
        sha256: String,
    }

    fn data_dir(app: &AppHandle) -> PathBuf {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("rockoon"))
            .join("wine")
    }

    fn builtin_root(app: &AppHandle) -> PathBuf {
        data_dir(app).join("runtime")
    }

    fn prefix_dir(app: &AppHandle) -> PathBuf {
        data_dir(app).join("prefix")
    }

    fn resource(app: &AppHandle, rel: &str) -> Option<PathBuf> {
        app.path()
            .resolve(rel, BaseDirectory::Resource)
            .ok()
            .filter(|p| p.is_file())
    }

    fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
    }

    /// 启动器自带的 Wine：压缩包和它的说明（构建时没跑 fetch-wine 就没有）
    fn bundled(app: &AppHandle) -> Option<(PathBuf, RuntimeManifest)> {
        let archive = resource(app, BUNDLED_ARCHIVE)?;
        let manifest = read_json(&resource(app, BUNDLED_MANIFEST)?)?;
        Some((archive, manifest))
    }

    /// 解出来的自带 Wine 能用、而且就是这个版本启动器带的那份
    fn builtin_current(app: &AppHandle) -> bool {
        let root = builtin_root(app);
        if !root.join("bin/wine").is_file() {
            return false;
        }
        match bundled(app) {
            Some((_, manifest)) => {
                read_json::<RuntimeManifest>(&root.join(RUNTIME_MARKER)) == Some(manifest)
            }
            // 没打包 Wine 的开发构建：之前解好的就接着用
            None => true,
        }
    }

    fn log_path(app: &AppHandle) -> PathBuf {
        let dir = app.path().app_log_dir().unwrap_or_else(|_| data_dir(app));
        let _ = fs::create_dir_all(&dir);
        dir.join("wine.log")
    }

    fn read_config(app: &AppHandle) -> WineConfig {
        read_json(&data_dir(app).join("config.json")).unwrap_or_default()
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

    /// 当前用哪个 Wine：用户指定的 → 启动器自带的（已经解出来、版本对得上）
    pub fn resolve(app: &AppHandle) -> Option<(PathBuf, &'static str)> {
        if let Some(custom) = read_config(app).custom_path {
            // 指定的 Wine 不见了就别悄悄换成别的，让用户知道
            return normalize_root(Path::new(&custom)).map(|root| (root, "custom"));
        }
        builtin_current(app).then(|| (builtin_root(app), "builtin"))
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

    fn read_marker(app: &AppHandle) -> Option<PrefixMarker> {
        read_json(&prefix_dir(app).join(".rockoon-prefix.json"))
    }

    fn expected_marker(root: &Path) -> PrefixMarker {
        PrefixMarker {
            wine_version: wine_version(root).unwrap_or_default(),
            revision: PREFIX_REVISION,
        }
    }

    pub fn status(app: &AppHandle) -> WineStatus {
        let resolved = resolve(app);
        let version = resolved.as_ref().and_then(|(root, _)| wine_version(root));
        let prefix = prefix_dir(app);
        let prefix_ready = version.as_ref().is_some_and(|v| {
            read_marker(app).is_some_and(|marker| {
                marker.wine_version == *v && marker.revision == PREFIX_REVISION
            }) && prefix.join("system.reg").is_file()
        });
        WineStatus {
            required: true,
            installed: resolved.is_some() && version.is_some(),
            source: resolved.as_ref().map(|(_, s)| s.to_string()),
            path: resolved.map(|(root, _)| root.to_string_lossy().to_string()),
            version,
            bundled_version: bundled(app).map(|(_, manifest)| manifest.version),
            prefix_ready,
            prefix: Some(prefix.to_string_lossy().to_string()),
            rosetta: rosetta_ok(),
            custom_path: read_config(app).custom_path,
        }
    }

    /// 带好前缀与通用环境变量的 Wine 命令，输出写进 wine.log
    fn wine_command(app: &AppHandle, root: &Path, program: &str, append_log: bool) -> Command {
        let mut cmd = Command::new(root.join("bin").join(program));
        cmd.env("WINEPREFIX", prefix_dir(app))
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
        resource(app, "resources-macos/wine/BallanceLauncher.exe")
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
            return Err(RcError::Other("需要先安装 Rosetta 2".into()));
        }
        if read_marker(app) != Some(expected_marker(&root)) {
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
        let prefix = prefix_dir(app);
        let marker = read_marker(app);
        if marker.as_ref() == Some(&expected) && prefix.join("system.reg").is_file() {
            return Ok(());
        }

        fs::create_dir_all(&prefix)?;
        let fresh = !prefix.join("system.reg").is_file();
        // 同一个 Wine、只是注册表表改了：补写注册表就行，不用再跑一遍 wineboot
        let same_wine = marker.is_some_and(|m| m.wine_version == expected.wine_version);
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
        let prefix = prefix_dir(app);
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

    /// 压缩包解开后找 Wine 根目录：fetch-wine 打的包是 `wine/bin/wine`
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

    /// 把自带的 Wine 解到 `<app data>/wine/runtime`（先解到临时目录，确认能跑再换进来），然后初始化前缀
    pub fn install(app: &AppHandle, reinstall: bool) -> RcResult {
        let _guard = INSTALL_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (archive, manifest) = bundled(app).ok_or_else(|| {
            RcError::Other(
                "这个启动器没有附带 Wine（构建时要先跑 pnpm fetch:wine），可以在设置里指定一个已有的 Wine"
                    .into(),
            )
        })?;
        let target = builtin_root(app);
        if reinstall || !builtin_current(app) {
            let _ = app.emit("wine-install:phase", "importing");
            let dir = data_dir(app);
            let staging = dir.join(".staging");
            let _ = fs::remove_dir_all(&staging);
            fs::create_dir_all(&staging)?;
            let cleanup = |e: RcError| {
                let _ = fs::remove_dir_all(&staging);
                e
            };
            let out = Command::new("/usr/bin/tar")
                .arg("-xf")
                .arg(&archive)
                .arg("-C")
                .arg(&staging)
                .stdin(Stdio::null())
                .output()
                .map_err(|e| cleanup(RcError::Other(format!("解压 Wine 失败：{e}"))))?;
            if !out.status.success() {
                return Err(cleanup(RcError::Other(format!(
                    "解压 Wine 失败：{}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ))));
            }
            let found = find_wine_root(&staging, 2)
                .ok_or_else(|| cleanup(RcError::Other("压缩包里没有找到 Wine（bin/wine）".into())))?;
            if wine_version(&found).is_none() {
                return Err(cleanup(RcError::Other(
                    "Wine 在本机上运行不了（Apple 芯片需要 Rosetta 2）".into(),
                )));
            }
            // 换掉旧的：先停掉可能还在跑的 wineserver
            if target.exists() {
                if target.join("bin/wineserver").is_file() {
                    let _ = run_logged(app, &target, "wineserver", &["-k"]);
                }
                fs::remove_dir_all(&target)
                    .map_err(|e| cleanup(RcError::Other(format!("无法替换旧的 Wine：{e}"))))?;
            }
            fs::rename(&found, &target)
                .map_err(|e| cleanup(RcError::Other(format!("安装 Wine 失败：{e}"))))?;
            let _ = fs::remove_dir_all(&staging);
            fs::write(
                target.join(RUNTIME_MARKER),
                serde_json::to_string_pretty(&manifest).unwrap_or_default(),
            )?;
            log::info!("Installed bundled wine {} into {}", manifest.version, target.display());
        }

        // 用户另外指定了 Wine 的话，前缀按那个 Wine 初始化（启动游戏时用的也是它）
        let _ = app.emit("wine-install:phase", "initializing");
        let root = resolve(app).map(|(root, _)| root).unwrap_or(target);
        ensure_prefix(app, &root)
            .map_err(|e| RcError::Other(format!("Wine 已安装，但前缀初始化失败：{e}")))
    }

    /// `softwareupdate --install-rosetta` 要管理员权限：借 osascript 弹系统的密码框
    pub fn install_rosetta() -> RcResult {
        if rosetta_ok() {
            return Ok(());
        }
        let out = Command::new("/usr/bin/osascript")
            .args([
                "-e",
                r#"do shell script "/usr/sbin/softwareupdate --install-rosetta --agree-to-license" with administrator privileges"#,
            ])
            .stdin(Stdio::null())
            .output()?;
        if rosetta_ok() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&out.stderr);
        // 密码框点了取消：osascript 报 -128
        if stderr.contains("-128") {
            return Err(RcError::Other("已取消".into()));
        }
        Err(RcError::Other(format!(
            "{}（也可以在「终端」里运行 softwareupdate --install-rosetta --agree-to-license）",
            stderr.trim()
        )))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn finds_root_in_archive_and_custom_layouts() {
            let dir = std::env::temp_dir().join("rockoon-wine-test-layout");
            let _ = fs::remove_dir_all(&dir);
            let packed = dir.join("staging/wine");
            fs::create_dir_all(packed.join("bin")).unwrap();
            fs::write(packed.join("bin/wine"), b"").unwrap();
            assert_eq!(find_wine_root(&dir.join("staging"), 2), Some(packed.clone()));

            let root = dir.join("Wine Devel.app/Contents/Resources/wine");
            fs::create_dir_all(root.join("bin")).unwrap();
            fs::write(root.join("bin/wine"), b"").unwrap();
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
