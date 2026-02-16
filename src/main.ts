import "@/assets/styles.scss";
import "mingcute_icon/font/Mingcute.css";

import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n, switchLanguage } from "./i18n";
import { router } from "./routers";
import { initStores } from "./stores";
import { usePrefStore } from "./stores/pref";
import { registerLoggers } from "./utils/logger";

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(router);

// register & hook loggers in `console`
registerLoggers();

// disable context menu
document.addEventListener("contextmenu", e => e.preventDefault());

// let tray: TrayIcon | null = null;
await initStores();

// if (!tray) {
//   tray = await TrayIcon.new({
//     icon: (await defaultWindowIcon())!,
//     action: e => {
//       if (e.type === "Click") {
//         tauriApp.toggleWindow();
//       }
//     },
//     menu: await Menu.new({
//       items: [await MenuItem.new({ text: "退出" })]
//     })
//   });
//   await tray.setShowMenuOnLeftClick(false);
//   await tray.setTooltip("Rockoon");
// }
// app.onUnmount(() => {
//   tray?.close();
//   tray = null;
// });

window.addEventListener("keydown", e => {
  // 举例：Ctrl + S
  if (e.ctrlKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    switchLanguage(i18n.global.locale === "zh" ? "en" : "zh");
  }
});

const pref = usePrefStore();
if (pref.centerWindow) {
  await moveWindow(Position.Center);
}

// await checkUpdate(true);

app.mount("#app");

console.info("Rockoon UI initialized");
