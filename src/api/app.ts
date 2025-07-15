import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

export default {
  log: (level: LogLevel, msg: string) => invoke("log", { level, msg }),
  hideWindow: () => invoke("hide_window"),
  showWindow: () => invoke("show_window"),
  toggleWindow: () => invoke("toggle_window"),
  openDevtools: () => invoke("open_devtools")
};
