import "@/assets/styles.css";

import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n, switchLanguage } from "./i18n";
import { router } from "./routers";
import { initStores } from "./stores";
import { usePrefStore } from "./stores/pref";
import { checkForUpdate } from "./services/updater";
import { registerLoggers } from "./utils/logger";

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(router);

// register & hook loggers in `console`
registerLoggers();

// disable context menu
document.addEventListener("contextmenu", e => e.preventDefault());

await initStores();

window.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    switchLanguage(i18n.global.locale === "zh" ? "en" : "zh");
  }
});

const pref = usePrefStore();
if (pref.centerWindow) {
  await moveWindow(Position.Center);
}

app.mount("#app");

// background check for updates after startup
setTimeout(checkForUpdate, 3000);

console.info("Rockoon UI initialized");
