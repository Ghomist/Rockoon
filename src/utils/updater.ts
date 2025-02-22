import { check } from "@tauri-apps/plugin-updater";
import { openDialog } from "./message";
// import { relaunch } from "@tauri-apps/plugin-process";

export const checkUpdate = async () => {
  const update = await check();
  if (update) {
    openDialog(
      `found update ${update.version} from ${update.date} with notes ${update.body}`,
      {
        title: "更新提示"
      }
    );
  }
};
