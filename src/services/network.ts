import backend from "@/backend";
import { usePrefStore } from "@/stores/pref";

/** 把 pref 里的下载代理配置推给 Rust（启动时 / 设置变更时各一次）。 */
export async function applyDownloadProxy(): Promise<void> {
  const { downloadProxyMode, downloadProxy } = usePrefStore.getState();
  try {
    await backend.network.apply({
      mode: downloadProxyMode,
      proxy: downloadProxy
    });
  } catch (e) {
    // 推不过去不影响启动：Rust 端会退回默认的「跟随系统代理」
    console.warn("设置下载代理失败", e);
  }
}

/**
 * 启动时同步一次，之后跟随 pref 变化（换实例、清空数据、设置里改代理都会触发）。
 * Rust 那边只存内存，所以每次启动都要重新推一遍。
 */
export function initDownloadProxy(): void {
  void applyDownloadProxy();
  usePrefStore.subscribe(
    s => `${s.downloadProxyMode}\u0000${s.downloadProxy}`,
    () => void applyDownloadProxy()
  );
}
