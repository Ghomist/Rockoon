import { check, type Update } from "@tauri-apps/plugin-updater";

import { updateNotesContent } from "@/components/UpdateNotes";
import { useDownloadsStore } from "@/stores/downloads";
import { dialog, message } from "@/utils/ui/feedback";
import { t } from "@/i18n";
import { isMac } from "@/utils/platform";
import backend from "@/backend";

/**
 * 启动器自更新（下载 + 安装新版本）。
 *
 * 下载是「下载任务」页里的一个后台任务（见 stores/downloads），所以从设置页检查、
 * 还是启动 3 秒后的自动检查（main.tsx）触发都一样，界面上不需要常驻的进度组件。
 *
 * 注意：tauri 的更新插件**没有取消接口**，这段下载中断不了 —— 所以任务登记成
 * cancellable: false（界面上不出现「取消」按钮），只能等它下完（或关掉启动器）。
 *
 * 更新日志（`update.body`）＝ release 里 latest.json 的 `notes` ＝ release 正文
 * ＝ 仓库里的 `release-notes/<版本>.md`（发版流程强制要写，见 .github/workflows/release.yml）。
 * 展示交给 components/UpdateNotes。
 */

export async function checkForUpdate(): Promise<void> {
  try {
    const update = await check({ timeout: 15 * 1000 });
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

function showUpdateDialog(update: Update): void {
  const version = update.version;
  const notes = update.body ?? "";
  // 点了「立即更新」就让确认框退场，改由「下载任务」页显示进度；只有用户放弃时才提示
  let started = false;

  // 有更新日志就排版出来（components/UpdateNotes），没有就只问一句要不要更新
  const content = notes
    ? updateNotesContent(version, notes)
    : t("updater.available", { version });

  dialog.info({
    title: t("updater.title"),
    content,
    positiveText: t("updater.updateNow"),
    negativeText: t("updater.later"),
    onPositiveClick: () => {
      started = true;
      void downloadAndInstall(update);
    },
    onClose: () => {
      if (!started) message.info(t("updater.dismiss"));
    }
  });
}

/** 自更新没有后端任务 id，任务 id 就用这个（同一次运行内不重复） */
let taskSeq = 0;

async function downloadAndInstall(update: Update): Promise<void> {
  const downloads = useDownloadsStore.getState();
  const { task, duplicate } = downloads.begin({
    id: `update-${++taskSeq}`,
    key: `update:${update.version}`,
    kind: "update",
    title: t("updater.taskTitle"),
    cancellable: false
  });
  // 同一个版本已经在下载了：不重复下载
  if (duplicate) return;

  const id = task.id;
  let total = 0;
  let downloaded = 0;
  try {
    await update.downloadAndInstall(event => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          downloads.update(id, { total, phase: "downloading" });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          downloads.progress(id, downloaded, total);
          break;
        case "Finished":
          // 下载完了，接下来是跑安装包（启动器会被替换掉）
          downloads.update(id, {
            phase: "importing",
            percent: 100,
            downloaded: total || downloaded
          });
          break;
      }
    });
    downloads.succeed(id);
    if (isMac) {
      // macOS 的更新插件只负责把 .app 换掉，不会重启进程 —— 不重启就还在跑旧的可执行文件
      message.success(t("updater.restarting"));
      await backend.restartApp();
      return;
    }
    message.success(t("updater.installed"));
  } catch (e) {
    console.error("Update failed:", e);
    downloads.fail(id, t("updater.error"));
    message.error(t("updater.error"));
  }
}
