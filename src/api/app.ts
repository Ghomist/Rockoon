import { invoke } from "@tauri-apps/api/core";

export default {
  log: (msg: string) => invoke("log", { msg }),
  hideWindow: () => invoke("hide_window"),
  showWindow: () => invoke("show_window"),
  toggleWindow: () => invoke("toggle_window")
};
