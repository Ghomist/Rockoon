import "@/assets/styles.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import App from "@/App";
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
createRoot(rootEl).render(
  <MemoryRouter>
    <App />
  </MemoryRouter>
);

initStores().catch(e => console.error("initStores failed:", e));

if (usePrefStore.getState().centerWindow) {
  moveWindow(Position.Center).catch(() => {
    // ignore: positioner plugin may not be ready
  });
}

// Background update check.
setTimeout(checkForUpdate, 3000);

console.info("Rockoon UI initialized");
