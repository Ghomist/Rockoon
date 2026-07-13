import { check, type Update } from "@tauri-apps/plugin-updater";
import { dialog, message } from "@/utils/ui/feedback";
import { t } from "@/i18n";

export async function checkForUpdate(): Promise<void> {
  try {
    const update = await check({ timeout: 15 * 1000 }); // timeout in 15s
    if (update) {
      showUpdateDialog(update);
    } else {
      message.success(t("settings.noUpdate"));
    }
  } catch (e) {
    console.warn("Update check failed:", e);
    message.error(t("updater.error"));
  }
}

function showUpdateDialog(update: Update) {
  const version = update.version;
  const notes = update.body ?? "";

  const content = notes
    ? `${t("updater.available", { version })}\n\n${t("updater.notes")}:\n${notes}`
    : t("updater.available", { version });

  dialog.info({
    title: t("updater.title"),
    content,
    positiveText: t("updater.updateNow"),
    negativeText: t("updater.later"),
    onPositiveClick: () => {
      downloadAndInstall(update);
      return false;
    },
    onClose: () => {
      message.info(t("updater.dismiss"));
    }
  });
}

async function downloadAndInstall(update: Update) {
  const msg = message.loading(t("updater.downloading"), { duration: 0 });

  try {
    let downloaded = 0;
    let total = 0;

    await update.downloadAndInstall(event => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (total > 0) {
            msg.update(
              t("updater.downloadProgress", {
                downloaded: formatBytes(downloaded),
                total: formatBytes(total)
              })
            );
          }
          break;
        case "Finished":
          msg.update(t("updater.installing"));
          break;
      }
    });

    msg.destroy();
    message.success(t("updater.installing"));
  } catch (e) {
    msg.destroy();
    console.error("Update failed:", e);
    message.error(t("updater.error"));
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
