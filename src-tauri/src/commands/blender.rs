//! 制图工具：Blender + BBP（Ballance Blender Plugin，yyc12345/BallanceBlenderHelper）。
//!
//! - Blender 不代装：只找本机已经装好的（注册表卸载项 / 常见目录 / PATH），用户也可以手选；
//! - BBP 一键安装：前端用 `start_patch_install` 把 GitHub release 的 zip 解压进 Blender 的
//!   `extensions/user_default/bbp_ng`（位置由 `blender_probe` 问 Blender 得到），再调
//!   `blender_configure_bbp` 启用插件、把材质目录指向当前游戏的 Textures。
//!   不用 `blender --command extension install-file`：BBP 已启用时它会把 BMap.dll 载进
//!   执行命令的那个 Blender 进程，覆盖安装直接报 `BMap operation failed`；
//! - 一键编辑：`blender_open_map` 起 GUI 版 Blender，跑 open_map.py 清场景 + 用 BBP 导入地图。
//!
//! 跟 Blender 打交道全靠 `blender -b --python <脚本>`，脚本内嵌在二进制里，用时写到临时目录；
//! 脚本往 stdout 打一行 `ROCKOON_…` 作为结果。

use crate::common::exception::{RcError, RcResult, RcResultWith};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::command;

const PROBE_PY: &str = include_str!("blender_py/probe.py");
const CONFIGURE_PY: &str = include_str!("blender_py/configure.py");
const OPEN_MAP_PY: &str = include_str!("blender_py/open_map.py");

const BBP_RELEASE_API: &str =
    "https://api.github.com/repos/yyc12345/BallanceBlenderHelper/releases/latest";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BbpModule {
    /// `bl_ext.user_default.bbp_ng`（4.0+ 扩展）或旧插件的模块名
    module: String,
    version: String,
    enabled: bool,
    texture_folder: String,
    /// 插件所在目录（提示用户手动删旧版时用）
    path: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderProbe {
    version: String,
    /// user_default 扩展仓库的目录，BBP 解压到它下面的 bbp_ng
    extensions_dir: String,
    bbp: Vec<BbpModule>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BbpRelease {
    tag: String,
    asset_name: String,
    url: String,
    size: u64,
}

fn other(msg: impl Into<String>) -> RcError {
    RcError::Other(msg.into())
}

/// 用户可能选的是 Blender.app（macOS）或 blender-launcher.exe（Windows，它会脱离控制台、拿不到输出），
/// 统一换成真正的可执行文件。
fn resolve_exe(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("app")) {
        return p.join("Contents").join("MacOS").join("Blender");
    }
    if p.file_name()
        .is_some_and(|n| n.eq_ignore_ascii_case("blender-launcher.exe"))
    {
        return p.with_file_name("blender.exe");
    }
    p
}

fn blender_command(exe: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(resolve_exe(exe));
    // blender.exe 是控制台程序：不加这个会闪一个黑框（GUI 窗口不受影响）
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

fn write_script(name: &str, body: &str) -> Result<PathBuf, RcError> {
    let dir = std::env::temp_dir().join("rockoon-blender");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(name);
    std::fs::write(&path, body)?;
    Ok(path)
}

/// 后台跑一个脚本，返回脚本打出的 `ROCKOON_<tag>` 行（不含前缀）。
fn run_background(exe: &str, name: &str, body: &str, args: &[&str]) -> Result<String, RcError> {
    let script = write_script(name, body)?;
    let out = blender_command(exe)
        .args(["-b", "--python"])
        .arg(&script)
        .arg("--")
        .args(args)
        .output()
        .map_err(|e| other(format!("无法启动 Blender：{e}")))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if let Some(line) = stdout
        .lines()
        .find_map(|l| l.trim().strip_prefix("ROCKOON_"))
    {
        return Ok(line.to_string());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let tail: Vec<&str> = stderr.lines().rev().take(5).collect();
    Err(other(format!(
        "Blender 没有返回结果（{}）{}",
        out.status,
        tail.into_iter().rev().collect::<Vec<_>>().join("\n")
    )))
}

/// 本机能找到的 Blender（只看文件在不在，不启动它）。
#[command(async)]
pub fn blender_find() -> Vec<String> {
    let mut found: Vec<PathBuf> = Vec::new();
    let exe = if cfg!(windows) {
        "blender.exe"
    } else {
        "blender"
    };

    #[cfg(target_os = "windows")]
    {
        found.extend(registry_install_dirs().into_iter().map(|d| d.join(exe)));
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                let base = Path::new(&pf).join("Blender Foundation");
                if let Ok(rd) = std::fs::read_dir(&base) {
                    found.extend(rd.flatten().map(|e| e.path().join(exe)));
                }
                found.push(
                    Path::new(&pf)
                        .join("Steam/steamapps/common/Blender")
                        .join(exe),
                );
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![PathBuf::from("/Applications")];
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(Path::new(&home).join("Applications"));
        }
        for root in roots {
            if let Ok(rd) = std::fs::read_dir(&root) {
                found.extend(rd.flatten().map(|e| e.path()).filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| n.starts_with("Blender") && n.ends_with(".app"))
                }));
            }
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        found.extend(std::env::split_paths(&path).map(|d| d.join(exe)));
    }

    let mut out: Vec<String> = Vec::new();
    for p in found {
        if !resolve_exe(&p.to_string_lossy()).is_file() {
            continue;
        }
        let s = p.to_string_lossy().to_string();
        if !out.iter().any(|o| o.eq_ignore_ascii_case(&s)) {
            out.push(s);
        }
    }
    out
}

/// Windows 卸载项里 DisplayName 以 Blender 开头的 InstallLocation（官方 msi 安装会写）。
#[cfg(target_os = "windows")]
fn registry_install_dirs() -> Vec<PathBuf> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::*;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let uninstall = wide(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
    let mut out = Vec::new();
    let views = [
        (HKEY_LOCAL_MACHINE, KEY_WOW64_64KEY, RRF_SUBKEY_WOW6464KEY),
        (HKEY_LOCAL_MACHINE, KEY_WOW64_32KEY, RRF_SUBKEY_WOW6432KEY),
        (HKEY_CURRENT_USER, 0, 0),
    ];
    for (root, view, sub_view) in views {
        let mut key: HKEY = std::ptr::null_mut();
        if unsafe { RegOpenKeyExW(root, uninstall.as_ptr(), 0, KEY_READ | view, &mut key) }
            != ERROR_SUCCESS
        {
            continue;
        }
        let mut index = 0;
        loop {
            let mut name = [0u16; 256];
            let mut len = name.len() as u32;
            let rc = unsafe {
                RegEnumKeyExW(
                    key,
                    index,
                    name.as_mut_ptr(),
                    &mut len,
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            if rc != ERROR_SUCCESS {
                break;
            }
            index += 1;
            let read = |value: &str| -> Option<String> {
                let value = wide(value);
                let mut buf = [0u16; 1024];
                let mut size = (buf.len() * 2) as u32;
                let rc = unsafe {
                    RegGetValueW(
                        key,
                        name.as_ptr(),
                        value.as_ptr(),
                        RRF_RT_REG_SZ | sub_view,
                        std::ptr::null_mut(),
                        buf.as_mut_ptr().cast(),
                        &mut size,
                    )
                };
                (rc == ERROR_SUCCESS).then(|| {
                    String::from_utf16_lossy(&buf[..(size as usize / 2).saturating_sub(1)])
                })
            };
            if read("DisplayName").is_some_and(|n| n.starts_with("Blender")) {
                if let Some(dir) = read("InstallLocation").filter(|d| !d.is_empty()) {
                    out.push(PathBuf::from(dir));
                }
            }
        }
        unsafe { RegCloseKey(key) };
    }
    out
}

/// 启动一次 Blender（后台，约 1 秒）看版本、BBP 装没装 / 启用没 / 材质目录。
#[command(async)]
pub fn blender_probe(exe: String) -> RcResultWith<BlenderProbe> {
    let line = run_background(&exe, "probe.py", PROBE_PY, &[])?;
    let json = line
        .strip_prefix("JSON:")
        .ok_or_else(|| other(format!("Blender 返回了意外的结果：{line}")))?;
    serde_json::from_str(json).map_err(|e| other(format!("解析 Blender 返回失败：{e}")))
}

/// 启用 BBP 并把材质目录设成 `textures`（空串表示不改），保存 Blender 偏好设置。
#[command(async)]
pub fn blender_configure_bbp(exe: String, textures: String) -> RcResult {
    let line = run_background(&exe, "configure.py", CONFIGURE_PY, &[&textures])?;
    match line.strip_prefix("ERROR:") {
        Some(err) => Err(other(err.to_string())),
        None => Ok(()),
    }
}

/// 打开 Blender 并用 BBP 导入地图（不等它退出）。
#[command(async)]
pub fn blender_open_map(exe: String, map: String, textures: String) -> RcResult {
    let script = write_script("open_map.py", OPEN_MAP_PY)?;
    let mut cmd = blender_command(&exe);
    if let Some(dir) = Path::new(&map).parent() {
        cmd.current_dir(dir);
    }
    cmd.arg("--python")
        .arg(&script)
        .arg("--")
        .arg(&map)
        .arg(&textures)
        // GUI 进程长期存活，别让它继承我们的标准输入输出
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| other(format!("无法启动 Blender：{e}")))?;
    Ok(())
}

/// GitHub 上 BBP 的最新 release，挑出当前系统对应的 zip。
#[command(async)]
pub fn bbp_latest_release() -> RcResultWith<BbpRelease> {
    let platform = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    };
    let text = ureq::get(BBP_RELEASE_API)
        .set("User-Agent", "Rockoon")
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| other(format!("连接 GitHub 失败：{e}")))?
        .into_string()?;
    let body: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| other(format!("解析 GitHub 返回失败：{e}")))?;
    let tag = body["tag_name"].as_str().unwrap_or_default().to_string();
    let asset = body["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|a| {
            a["name"]
                .as_str()
                .is_some_and(|n| n.contains(platform) && n.ends_with(".zip"))
        })
        .ok_or_else(|| other(format!("BBP {tag} 没有 {platform} 版本的安装包")))?;
    Ok(BbpRelease {
        tag,
        asset_name: asset["name"].as_str().unwrap_or_default().to_string(),
        url: asset["browser_download_url"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        size: asset["size"].as_u64().unwrap_or(0),
    })
}
