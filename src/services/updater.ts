import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

import type { ImportPhase } from "@/components/ImportProgressDialog";
import { dialog, message } from "@/utils/ui/feedback";
import { t } from "@/i18n";

/**
 * 启动器自更新（下载 + 安装新版本）。
 *
 * 进度只有一份：检查更新可能来自设置页，也可能来自启动 3 秒后的自动检查
 * （main.tsx），所以状态放在这个 store 里，界面交给 App 里常驻的
 * <AppUpdateProgress /> 渲染。
 *
 * 注意：tauri 的更新插件**没有取消接口**，这段下载中断不了 —— 因此进度弹窗
 * 锁死后不给「取消」按钮（ImportProgressDialog 不传 onCancel 就没有），
 * 只能等它下完（或直接关掉启动器）。
 */
interface UpdateProgressState {
  open: boolean;
  phase: ImportPhase;
  percent: number;
  downloaded: number;
  total: number;
  error: string;
  apply: (patch: Partial<UpdateProgressState>) => void;
  close: () => void;
}

export const useUpdateProgress = create<UpdateProgressState>(set => ({
  open: false,
  phase: "connecting",
  percent: 0,
  downloaded: 0,
  total: 0,
  error: "",
  apply: patch => set(patch),
  close: () =>
    set({ open: false, error: "", percent: 0, downloaded: 0, total: 0 })
}));

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
  // 点了「立即更新」就让确认框退场，改由锁死的进度弹窗显示下载；只有用户放弃时才提示
  let started = false;

  const content = notes
    ? `${t("updater.available", { version })}\n\n${t("updater.notes")}:\n${notes}`
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

async function downloadAndInstall(update: Update): Promise<void> {
  const { apply } = useUpdateProgress.getState();
  apply({
    open: true,
    phase: "downloading",
    percent: 0,
    downloaded: 0,
    total: 0,
    error: ""
  });

  let total = 0;
  let downloaded = 0;
  try {
    await update.downloadAndInstall(event => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          apply({ total });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          apply({
            downloaded,
            percent:
              total > 0
                ? Math.min(100, Math.round((downloaded / total) * 100))
                : 0
          });
          break;
        case "Finished":
          // 下载完了，接下来是跑安装包（启动器会被替换掉）
          apply({
            phase: "importing",
            percent: 100,
            downloaded: total || downloaded
          });
          break;
      }
    });
    apply({ phase: "done", percent: 100 });
  } catch (e) {
    console.error("Update failed:", e);
    apply({ error: t("updater.error") });
  }
}
