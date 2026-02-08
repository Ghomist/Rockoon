import { check } from "@tauri-apps/plugin-updater";
import { h, ref } from "vue";
import { toPercentage } from "../format";

export const checkUpdate = async (quiet = false) => {
  let update;
  try {
    update = await check({
      timeout: 10000
    });
  } catch {
    if (!quiet) sendMessage("检查更新失败");
    return;
  }
  if (update) {
    let date = "未知更新时间";
    if (update.date) {
      date = update.date
        .replace(/\s+([+-]\d{2}:\d{2}):\d{2}$/, "$1")
        .replace(/(?<!\d)(\d)(?!\d)/, "0$1")
        .replace(" ", "T");
      date = new Date(date).toLocaleString("zh-CN", {
        dateStyle: "long",
        timeStyle: "short"
      });
    }
    openDialog(`更新至 <b>${update.version}</b> (${date})`, {
      lock: true,
      title: "发现新版本！",
      sureText: "更新并重启 Rockoon",
      onSure: async () => {
        const message = ref("");
        const { close } = openDialog(() => h("p", message.value), {
          title: "更新中...",
          lock: true,
          footer: false
        });
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall(event => {
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength ?? 0;
              message.value = "开始下载...";
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              message.value = `下载中... ${toPercentage(downloaded / contentLength)}`;
              break;
            case "Finished":
              message.value = `下载完成！`;
              break;
          }
        });
        close();
        if (!quiet) sendMessage("更新完成！请重启 Rockoon");
      }
    });
  } else {
    if (!quiet) sendMessage("已是最新版本！");
  }
};
