import "mingcute_icon/font/Mingcute.css";
import "./assets/styles.css";

import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initStores } from "./stores";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");

// disable context menu
document.addEventListener("contextmenu", e => e.preventDefault());

// let tray: TrayIcon | null = null;
const init = async () => {
  await moveWindow(Position.Center);

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

  await initStores();
};

init();
