//! 下载（以及所有走 ureq 的请求）走哪条网络出口。
//!
//! 配置由前端在启动时推给 Rust（`set_network_config`），只放在内存里：
//! 真正持久化的是 pref store 的 localStorage，前端每次启动会重新推一遍。
//!
//! 三种模式：
//! - `system`：跟随系统代理（Windows 读 Internet 选项注册表，其它平台读环境变量）
//! - `custom`：用户填的代理地址（`http://` / `socks5://`，可带账号密码）
//! - `direct`：直连，忽略系统代理与环境变量
//!
//! 不支持的：PAC / 自动配置脚本（ureq 只认静态代理）、`ProxyOverride` 绕过列表
//! （ureq 的代理是 Agent 级的，不做逐主机判断）、`NO_PROXY` 环境变量。
//! 这也是留「自定义代理」的原因：系统只配了 PAC 时，下载要么走自定义代理，要么直连。

use std::sync::{LazyLock, RwLock};

/// 前端 pref store 里的下载代理配置
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetworkConfig {
    /// `system` 跟随系统代理 / `custom` 用 `proxy` / `direct` 直连
    pub mode: String,
    /// 自定义代理地址
    pub proxy: String,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            mode: "system".to_string(),
            proxy: String::new(),
        }
    }
}

/// 某个配置最终会走哪条出口（给日志与界面展示用）。
///
/// `proxy` 只放「能用的地址」：地址无效 / 系统没配代理时是 `None`，也就是实际会直连。
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    /// `direct` / `system` / `custom`
    pub kind: &'static str,
    /// 实际用的代理地址
    pub proxy: Option<String>,
    /// 地址来源：`registry`（Windows Internet 设置）/ `env`（环境变量）/ `custom`
    pub source: Option<&'static str>,
}

static CONFIG: LazyLock<RwLock<NetworkConfig>> =
    LazyLock::new(|| RwLock::new(NetworkConfig::default()));

/// 当前生效的配置
pub fn config() -> NetworkConfig {
    CONFIG.read().map(|c| c.clone()).unwrap_or_default()
}

/// 应用新配置，返回给人看的出口描述（同时写日志）。
pub fn apply(config: NetworkConfig) -> String {
    let description = describe(&config);
    log::info!("下载代理：{description}");
    if let Ok(mut current) = CONFIG.write() {
        *current = config;
    }
    description
}

/// 给下载器用的 agent builder：统一在这里挂代理，调用方只需补自己的超时配置。
pub fn agent_builder() -> ureq::AgentBuilder {
    builder_for(&config())
}

/// 当前配置下的 agent
pub fn agent() -> ureq::Agent {
    agent_builder().build()
}

/// 用某个（可能还没保存的）配置建一个 agent：设置里的「测试连接」用
pub fn agent_for(config: &NetworkConfig) -> ureq::Agent {
    builder_for(config).build()
}

/// 解析一个配置：会不会走代理、用哪个地址。不做网络请求。
pub fn resolve(config: &NetworkConfig) -> Resolved {
    match config.mode.trim() {
        "direct" => Resolved {
            kind: "direct",
            proxy: None,
            source: None,
        },
        "custom" => {
            let raw = config.proxy.trim();
            Resolved {
                kind: "custom",
                proxy: (!raw.is_empty() && ureq::Proxy::new(raw).is_ok()).then(|| raw.to_string()),
                source: Some("custom"),
            }
        }
        // system（以及未知值，比如老版本存下来的空串）
        _ => match system_proxy() {
            Some((raw, source)) if ureq::Proxy::new(&raw).is_ok() => Resolved {
                kind: "system",
                proxy: Some(raw),
                source: Some(source),
            },
            _ => Resolved {
                kind: "system",
                proxy: None,
                source: None,
            },
        },
    }
}

/// 描述某个配置最终会怎么走，写日志用
pub fn describe(config: &NetworkConfig) -> String {
    let resolved = resolve(config);
    match resolved.kind {
        "direct" => "直连（忽略系统代理）".to_string(),
        "custom" => match resolved.proxy {
            Some(proxy) => format!("自定义代理 {proxy}"),
            None if config.proxy.trim().is_empty() => {
                "自定义代理：没填地址，按直连处理".to_string()
            }
            None => format!("自定义代理地址无效（{}），按直连处理", config.proxy.trim()),
        },
        _ => match (resolved.proxy, resolved.source) {
            (Some(proxy), Some(source)) => format!("系统代理 {proxy}（{}）", source_label(source)),
            _ => "直连（系统没有可用的代理）".to_string(),
        },
    }
}

fn source_label(source: &str) -> &'static str {
    match source {
        "registry" => "Windows Internet 设置",
        "env" => "环境变量",
        _ => "自定义",
    }
}

fn builder_for(config: &NetworkConfig) -> ureq::AgentBuilder {
    // 不让 ureq 自己偷偷读环境变量：走不走代理由这里的策略决定（`direct` 必须能压住它）
    let mut builder = ureq::AgentBuilder::new().try_proxy_from_env(false);
    if let Some(proxy) = proxy_for(config) {
        builder = builder.proxy(proxy);
    }
    builder
}

fn proxy_for(config: &NetworkConfig) -> Option<ureq::Proxy> {
    let resolved = resolve(config);
    let raw = resolved.proxy?;
    match ureq::Proxy::new(&raw) {
        Ok(proxy) => {
            let source = resolved.source.map(source_label).unwrap_or("未知");
            log::info!("下载走{source}代理：{raw}");
            Some(proxy)
        }
        Err(e) => {
            log::warn!("代理地址无法使用（{raw}）：{e}，按直连处理");
            None
        }
    }
}

/// 系统代理：Windows 上先看 Internet 选项，再看环境变量；其它平台只看环境变量。
fn system_proxy() -> Option<(String, &'static str)> {
    #[cfg(target_os = "windows")]
    if let Some(raw) = windows_system_proxy() {
        return Some((raw, "registry"));
    }
    env_proxy().map(|raw| (raw, "env"))
}

/// 常见代理环境变量（大小写都认，Windows 上大小写不敏感）。
/// `NO_PROXY` 不处理 —— 下载站就一个域名，要绕过请选「直连」。
fn env_proxy() -> Option<String> {
    const KEYS: [&str; 6] = [
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
        "ALL_PROXY",
        "all_proxy",
    ];
    KEYS.iter().find_map(|key| {
        let value = std::env::var(key).ok()?;
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

/// Windows「Internet 选项 → 连接 → 局域网设置」里的静态代理。
#[cfg(target_os = "windows")]
fn windows_system_proxy() -> Option<String> {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
    };

    const IE_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read(
        subkey: &[u16],
        name: &str,
        flag: u32,
        data: *mut std::ffi::c_void,
        len: &mut u32,
    ) -> bool {
        let name = wide(name);
        unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                name.as_ptr(),
                flag,
                std::ptr::null_mut(),
                data,
                len,
            ) == ERROR_SUCCESS
        }
    }

    let subkey = wide(IE_SETTINGS);

    // ProxyEnable = 0 说明静态代理是关的（系统可能改用 PAC，那玩意我们不支持）
    let mut enabled: u32 = 0;
    let mut len = std::mem::size_of::<u32>() as u32;
    let enabled_read = read(
        &subkey,
        "ProxyEnable",
        RRF_RT_REG_DWORD,
        (&mut enabled as *mut u32).cast(),
        &mut len,
    );
    if !enabled_read || enabled == 0 {
        return None;
    }

    let mut buf = [0u16; 2048];
    let mut len = (buf.len() * std::mem::size_of::<u16>()) as u32;
    if !read(
        &subkey,
        "ProxyServer",
        RRF_RT_REG_SZ,
        buf.as_mut_ptr().cast(),
        &mut len,
    ) {
        return None;
    }
    let chars = (len as usize / std::mem::size_of::<u16>()).saturating_sub(1);
    let raw = String::from_utf16_lossy(&buf[..chars.min(buf.len())]);
    pick_proxy_entry(&raw)
}

/// `ProxyServer` 有两种写法：`host:port`，或按目标协议分开写的
/// `http=h:p;https=h:p;socks=h:p`。下载站全走 https，所以优先 `https=`，
/// 其次 `http=`，最后 socks。
#[cfg(target_os = "windows")]
fn pick_proxy_entry(raw: &str) -> Option<String> {
    fn address(addr: &str) -> &str {
        let addr = addr.trim();
        addr.split_once("://").map(|(_, rest)| rest).unwrap_or(addr)
    }

    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.contains('=') {
        return Some(format!("http://{}", address(raw)));
    }

    let mut https = None;
    let mut http = None;
    let mut socks = None;
    for part in raw.split(';') {
        let Some((scheme, addr)) = part.split_once('=') else {
            continue;
        };
        let scheme = scheme.trim().to_ascii_lowercase();
        let addr = address(addr);
        if addr.is_empty() {
            continue;
        }
        match scheme.as_str() {
            // `https=` 说的是「连 https 目标时用哪个地址」，代理本身仍是 HTTP 代理
            "https" => https = Some(format!("http://{addr}")),
            "http" => http = Some(format!("http://{addr}")),
            "socks" | "socks4" | "socks4a" | "socks5" => {
                socks = Some(format!("{scheme}://{addr}"));
            }
            _ => {}
        }
    }
    https.or(http).or(socks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_follows_system() {
        let cfg = NetworkConfig::default();
        assert_eq!(cfg.mode, "system");
        assert!(cfg.proxy.is_empty());
    }

    #[test]
    fn direct_mode_has_no_proxy() {
        let cfg = NetworkConfig {
            mode: "direct".into(),
            proxy: "http://127.0.0.1:7890".into(),
        };
        assert_eq!(resolve(&cfg).kind, "direct");
        assert!(proxy_for(&cfg).is_none());
    }

    #[test]
    fn custom_mode_parses_http_proxy() {
        let cfg = NetworkConfig {
            mode: "custom".into(),
            proxy: "http://127.0.0.1:7890".into(),
        };
        assert!(proxy_for(&cfg).is_some());
        assert_eq!(
            resolve(&cfg).proxy.as_deref(),
            Some("http://127.0.0.1:7890")
        );
        assert!(describe(&cfg).contains("127.0.0.1:7890"));
    }

    #[test]
    fn empty_custom_proxy_falls_back_to_direct() {
        let cfg = NetworkConfig {
            mode: "custom".into(),
            proxy: "  ".into(),
        };
        assert!(proxy_for(&cfg).is_none());
        assert!(resolve(&cfg).proxy.is_none());
        assert!(describe(&cfg).contains("没填地址"));
    }

    #[test]
    fn invalid_custom_proxy_is_reported() {
        let cfg = NetworkConfig {
            mode: "custom".into(),
            proxy: "ftp://127.0.0.1:21".into(),
        };
        assert!(resolve(&cfg).proxy.is_none());
        assert!(describe(&cfg).contains("无效"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn picks_https_entry_from_ie_proxy_list() {
        assert_eq!(
            pick_proxy_entry("http=10.0.0.1:8080;https=10.0.0.2:8443"),
            Some("http://10.0.0.2:8443".to_string())
        );
        assert_eq!(
            pick_proxy_entry("10.0.0.1:7890"),
            Some("http://10.0.0.1:7890".to_string())
        );
        assert_eq!(
            pick_proxy_entry("socks=127.0.0.1:1080"),
            Some("socks://127.0.0.1:1080".to_string())
        );
        assert_eq!(pick_proxy_entry("  "), None);
    }
}
