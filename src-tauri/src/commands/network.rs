//! 下载代理设置（见 `common/net.rs`）：推送配置 + 手动测试连通性。

use crate::common::exception::{RcResult, RcResultWith};
use crate::common::net::{self, NetworkConfig};
use std::time::{Duration, Instant};
use tauri::command;

/// 测试时最多等多久（连不上代理时别让用户干等）
const TEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTestResult {
    pub ok: bool,
    /// 实际出口：`direct` / `system` / `custom`
    pub exit_kind: String,
    /// 实际用的代理地址（没走代理时为空）
    pub exit_proxy: Option<String>,
    /// 地址来源：`registry` / `env` / `custom`
    pub exit_source: Option<String>,
    pub url: String,
    pub status: u16,
    pub elapsed_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 保存下载代理配置。只存在内存里，真正的持久化是前端的 pref store。
#[command]
pub fn set_network_config(config: NetworkConfig) -> RcResult {
    net::apply(config);
    Ok(())
}

/// 用给定的配置（不保存）请求一次 `url`，让用户确认代理通不通。
#[command(async)]
pub fn test_network_config(config: NetworkConfig, url: String) -> RcResultWith<NetworkTestResult> {
    let resolved = net::resolve(&config);
    let agent = net::agent_for(&config);
    let started = Instant::now();
    let reply = agent.get(&url).timeout(TEST_TIMEOUT).call();
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let (ok, status, error) = match reply {
        Ok(response) => {
            let status = response.status();
            ((200..400).contains(&status), status, None)
        }
        Err(e) => (false, 0, Some(e.to_string())),
    };

    Ok(NetworkTestResult {
        ok,
        exit_kind: resolved.kind.to_string(),
        exit_proxy: resolved.proxy,
        exit_source: resolved.source.map(str::to_string),
        url,
        status,
        elapsed_ms,
        error,
    })
}
