type HintType = "info" | "warning" | "error";

/** 下载代理配置（Rust `common/net.rs` 的 `NetworkConfig`） */
type DownloadProxyConfig = {
  mode: DownloadProxyMode;
  /** 自定义代理地址，mode 不是 custom 时忽略 */
  proxy: string;
};

/** `test_network_config` 的结果 */
type NetworkTestResult = {
  /** 拿到 2xx/3xx 才算通 */
  ok: boolean;
  /** 实际用的出口：direct / system / custom */
  exitKind: DownloadProxyMode;
  /** 实际用的代理地址（没走代理时没有） */
  exitProxy?: string;
  /** 地址来源：registry（Windows Internet 设置）/ env（环境变量）/ custom */
  exitSource?: "registry" | "env" | "custom";
  url: string;
  status: number;
  elapsedMs: number;
  error?: string;
};
