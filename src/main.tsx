import "@/assets/styles.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import App from "@/App";
import GlobalDialogHost from "@/components/GlobalDialogHost";
import { Toaster } from "@/components/ui/sonner";
import TasEditorWindow from "@/views/tas/TasEditorWindow";
import { initStores } from "@/stores";
import { usePrefStore } from "@/stores/pref";
import { switchLanguage, useI18nStore } from "@/i18n";
import { checkForUpdate } from "@/services/updater";
import { registerLoggers } from "@/utils/logger";

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

createRoot(rootEl).render(
  isTasWindow ? (
    // 帮助模态等弹窗走同一个 dialog store，所以 TAS 窗口也要挂一份 host；
    // toast 同理：Toaster 只挂在主窗口的 App 里，不在这里也挂一份的话编辑器的提示全都看不见
    <>
      <TasEditorWindow />
      <GlobalDialogHost />
      <Toaster richColors closeButton position="top-right" />
    </>
  ) : (
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )
);

initStores().catch(e => console.error("initStores failed:", e));

if (!isTasWindow) {
  if (usePrefStore.getState().centerWindow) {
    moveWindow(Position.Center).catch(() => {
      // ignore: positioner plugin may not be ready
    });
  }

  // Background update check.
  setTimeout(checkForUpdate, 3000);
}

console.info("Rockoon UI initialized");
