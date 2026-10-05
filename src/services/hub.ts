/**
 * 下载站地址与回落。
 *
 * 有些运营商主动拦截 `.top` 解析，所以下载站备了 `dl.bcrc.site` 别名。
 * 所有对下载站的请求都走这里：主域名连不上（DNS 被拦/超时）时自动切别名，
 * 并记住这次能用的那个，后续请求（含交给 Rust 下载器的 URL）都用它。
 *
 * 注意两点：
 * - 必须校验响应像不像下载站（content-type 是 JSON），否则别名还没指过来时
 *   会连上别的站、拿到 HTML 200 就被当成"成功"了。
 * - 下载是交给 Rust 的 `download` 插件做的（不走 webview），所以 URL 一定
 *   先经过一次上面的探测，避免把被拦的域名塞给它。
 */

/** 候选地址，第一个是正式域名 */
export const HUB_ORIGINS = ["https://dl.ballance.top", "https://dl.bcrc.site"] as const;

/** 单个候选的超时（被运营商拦时通常是干等，所以给短一点） */
const PROBE_TIMEOUT_MS = 5000;

let activeOrigin: string | null = null;

/** 当前认定的下载站基地址（没探测过时用正式域名） */
export function hubOrigin(): string {
  return activeOrigin ?? HUB_ORIGINS[0];
}

/** 拼下载站地址：给 Rust 下载器或外部浏览器用 */
export function hubUrl(path: string): string {
  return `${hubOrigin()}${path}`;
}

/** 按“已认定的优先”排候选 */
function candidateOrder(): string[] {
  if (!activeOrigin) return [...HUB_ORIGINS];
  return [activeOrigin, ...HUB_ORIGINS.filter(origin => origin !== activeOrigin)];
}

/**
 * 带回落的 fetch。成功（能连上 + 状态 OK + 响应是 JSON）就记住这个域名并返回响应，
 * 全都失败则抛出最后一个错误。
 */
export async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null;

  for (const origin of candidateOrder()) {
    try {
      const res = await fetch(`${origin}${path}`, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(PROBE_TIMEOUT_MS)
      });
      if (!res.ok) {
        throw new Error(`${origin} 返回 HTTP ${res.status}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        throw new Error(`${origin} 返回的不是下载站（content-type: ${contentType || "空"}）`);
      }
      activeOrigin = origin;
      return res;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("下载站不可达");
}

/**
 * 确保已经有一个确认可用的基地址（第一次用会探一次）。
 * 交给 Rust 下载器的 URL 之前先 await 它，免得把被拦的域名递过去。
 */
export async function hubReady(): Promise<string> {
  if (activeOrigin) return activeOrigin;
  try {
    await hubFetch("/packages?limit=1");
  } catch {
    // 探测失败就退回默认域名，让下游自己报错（错误信息更贴近实际原因）
  }
  return hubOrigin();
}

/**
 * 把下载站 URL 换到当前可用的域名（路径不变）。
 * 深链里带的可能正是被拦的那个域名，交给下载器前先换掉。
 * 不是下载站的地址原样返回。
 */
export function rebaseHubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isHub = HUB_ORIGINS.some(origin => new URL(origin).host === parsed.host);
    if (!isHub) return url;
    return `${hubOrigin()}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
