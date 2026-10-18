/**
 * 当前跑在哪个平台上。
 *
 * macOS 上 WebView 是 WKWebView，UA 里固定带 `Mac OS X`；用它判断就够了，
 * 不必为一个布尔值引入 os 插件。启动器在 macOS 上靠 Wine 跑游戏（见 services/wine.ts）。
 */
export const isMac = /Mac OS X|Macintosh/.test(navigator.userAgent);
