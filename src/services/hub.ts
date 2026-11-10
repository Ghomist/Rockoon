/**
 * 下载站地址（主域名 / 备用域名）。
 *
 * 有些运营商主动拦截 `.top` 解析，所以下载站备了 `dl.bcrc.site` 别名。
 * 用哪个域名由用户在「设置 → 网络」里选（pref 的 `downloadOriginMode`），
 * **不做自动切换**：被拦的时候自己切到备用域名，之后所有跟下载站交互的地方
 * （补丁、地图、模组、原版游戏、深链）都跟着走这个域名。
 *
 * 所以下载站相关的代码一律经过这里，不要在业务代码里直接写域名：
 * - `hubUrl(path)` / `hubUrlFor(mode, path)` 拼地址（交给 Rust 下载器、外部浏览器）
 * - `hubFetch(path)` 带超时 + 「像不像下载站」校验的 fetch
 * - `rebaseHubUrl(url)` 把深链里带的旧域名换成当前选的
 */

import { usePrefStore } from "@/stores/pref";

/** 两个域名：`primary` 是默认，`mirror` 是给被运营商拦截的用户备的 */
export const HUB_ORIGINS: Record<DownloadOriginMode, string> = {
  primary: "https://dl.ballance.top",
  mirror: "https://dl.bcrc.site"
};

/** 单个请求的超时（被运营商拦时通常是干等，所以给短一点） */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * 认识的域名 = 内置两个 + 下载站自己声明的根域名。
 * 只用来认地址（`rebaseHubUrl`），不参与「这次用哪个」的判断。
 */
const knownOrigins = new Set<string>(Object.values(HUB_ORIGINS));
let domainsAdopted = false;

/**
 * 拉一次下载站配置里的根域名表（`/site/domains`），并进 `knownOrigins`。
 * 这样下载站以后加根域名，深链里带的地址也能被认出来、换成当前选的域名。
 */
async function adoptHubDomains(origin: string): Promise<void> {
  try {
    const res = await fetch(`${origin}/site/domains`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) return;
    const data = (await res.json()) as { roots?: { frontend?: unknown }[] };
    for (const root of data.roots ?? []) {
      const value = root.frontend;
      if (typeof value === "string" && value.startsWith("http")) {
        knownOrigins.add(value.replace(/\/+$/, ""));
      }
    }
  } catch {
    // 拿不到就只认内置的两个
  }
}

/** 按指定模式拼下载站地址（设置页测试草稿用，不读 pref） */
export function hubUrlFor(mode: DownloadOriginMode, path: string): string {
  return `${HUB_ORIGINS[mode] ?? HUB_ORIGINS.primary}${path}`;
}

/** 当前选的下载站基地址 */
export function hubOrigin(): string {
  return (
    HUB_ORIGINS[usePrefStore.getState().downloadOriginMode] ??
    HUB_ORIGINS.primary
  );
}

/** 拼下载站地址：给 Rust 下载器或外部浏览器用 */
export function hubUrl(path: string): string {
  return `${hubOrigin()}${path}`;
}

/**
 * 请求下载站。**不做域名回落**：域名是用户选的，连不上就把错误抛出去，
 * 由界面提示去设置里切备用域名。
 */
export async function hubFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${hubOrigin()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${url} 请求失败：${reason}`);
  }
  if (!res.ok) {
    throw new Error(`${url} 返回 HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new Error(
      `${url} 返回的不是下载站（content-type: ${contentType || "空"}）`
    );
  }
  if (!domainsAdopted) {
    domainsAdopted = true;
    void adoptHubDomains(hubOrigin());
  }
  return res;
}

/**
 * 把下载站 URL 换到当前选的域名（路径不变）。
 * 深链里带的可能是另一个域名，交给下载器前先换掉。不是下载站的地址原样返回。
 */
export function rebaseHubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isHub = [...knownOrigins].some(
      origin => new URL(origin).host === parsed.host
    );
    if (!isHub) return url;
    return `${hubOrigin()}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
