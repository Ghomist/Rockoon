import "@/assets/styles.css";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import GlobalDialogHost from "@/components/GlobalDialogHost";
import { Toaster } from "@/components/ui/sonner";
import { initStores, initTasWindowStores } from "@/stores";
import { usePrefStore } from "@/stores/pref";
import { switchLanguage, useI18nStore } from "@/i18n";
import { checkForUpdate } from "@/services/updater";
import { registerLoggers } from "@/utils/logger";
import { isMac } from "@/utils/platform";

// Register console hooks → forward to Rust log stream.
registerLoggers();

// Disable right-click context menu (desktop app feel).
document.addEventListener("contextmenu", e => e.preventDefault());

// Ctrl+T: toggle language.
window.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    const cur = useI18nStore.getState().lang;
    switchLanguage(cur === "zh" ? "en" : "zh");
  }
});

// Render first, initialize async side effects after — so any failure in
// initStores or backend calls can never leave #app empty.
const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("#app not found");

// 独立窗口：同一个 index.html，带 ?window=tas 就只渲染 TAS 编辑器。
// （应用用的是 MemoryRouter，路径不体现在 URL 上，所以用查询参数分流）
const isTasWindow =
  new URLSearchParams(window.location.search).get("window") === "tas";

// 两个窗口各自只加载自己的那一份代码：TAS 编辑器有好几千行，主窗口用不到；反过来也一样
const App = lazy(() => import("@/App"));
const TasEditorWindow = lazy(() => import("@/views/tas/TasEditorWindow"));

createRoot(rootEl).render(
  isTasWindow ? (
    // 帮助模态等弹窗走同一个 dialog store，所以 TAS 窗口也要挂一份 host；
    // toast 同理：Toaster 只挂在主窗口的 App 里，不在这里也挂一份的话编辑器的提示全都看不见
    <>
      <Suspense fallback={null}>
        <TasEditorWindow />
      </Suspense>
      <GlobalDialogHost />
      <Toaster richColors closeButton position="top-right" />
    </>
  ) : (
    <MemoryRouter>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </MemoryRouter>
  )
);

if (isTasWindow) initTasWindowStores();
else initStores().catch(e => console.error("initStores failed:", e));

if (!isTasWindow) {
  if (usePrefStore.getState().centerWindow) {
    moveWindow(Position.Center).catch(() => {
      // ignore: positioner plugin may not be ready
    });
  }

  // Background update check.（上游只发布 Windows 版：macOS 移植版没有更新源，不自动检查）
  if (!isMac) setTimeout(() => void checkForUpdate({ silent: true }), 3000);
}

console.info("Rockoon UI initialized");
