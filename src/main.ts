import "mingcute_icon/font/Mingcute.css";
import "./assets/styles.css";

import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initStores } from "./stores";
import { TrayIcon } from "@tauri-apps/api/tray";
import tauriApp from "./api/app";
import { defaultWindowIcon } from "@tauri-apps/api/app";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");

// disable context menu
document.addEventListener("contextmenu", e => e.preventDefault());

const init = async () => {
  await moveWindow(Position.Center);

  // const tray = await TrayIcon.new({
  //   icon: (await defaultWindowIcon())!,
  //   action: e => {
  //     if (e.type === "Click") {
  //       tauriApp.toggleWindow();
  //     }
  //   }
  // });
  // await tray.setTooltip("Rockoon!");
  // app.onUnmount(() => tray.close());

  await initStores();
};

init();
