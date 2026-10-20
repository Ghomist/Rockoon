import { listen } from "@tauri-apps/api/event";

import backend from "@/backend";
import { t } from "@/i18n";
import { useDownloadsStore, type DownloadPhase } from "@/stores/downloads";
import { dialog, message } from "@/utils/ui/feedback";

/**
 * Wine 运行时（macOS）。
 *
 * Ballance 是 32 位 Windows 游戏，在 Mac 上靠 Wine 跑。Wine 随启动器一起打包（构建时
 * scripts/fetch-wine.mjs 做的精简包），第一次用时解到启动器数据目录、初始化前缀（约半分钟），
 * 不需要联网；用户也可以在设置里指定一个已有的 Wine。所有游戏实例共用一个 Wine 前缀。
 * 解压显示成「下载任务」页里的一个任务（kind: "wine"）。后端见 src-tauri/src/commands/wine.rs。
 */

const TASK_KEY = "wine:runtime";

/** 占位任务 id：后端没有任务 id，登记任务要一个 */
let taskSeq = 0;

/** Wine 正在安装吗（下载任务里有没有进行中的） */
export function wineInstalling(): boolean {
  return useDownloadsStore.getState().findByKey(TASK_KEY)?.status === "running";
}

/**
 * 把启动器自带的 Wine 解出来并初始化前缀，登记成一个「下载任务」（`reinstall` 为 true 时重新解）。
 * 已经有安装任务在跑时直接返回 false；装好返回 true，失败返回 false（任务已标成失败）。
 */
export async function installWineAsTask(reinstall = false): Promise<boolean> {
  const { task, duplicate } = useDownloadsStore.getState().begin({
    id: `wine-${++taskSeq}`,
    key: TASK_KEY,
    kind: "wine",
    title: t("wine.taskTitle"),
    target: t("wine.taskTarget"),
    cancellable: false,
    silent: true,
    retry: () => void installWineAsTask(reinstall)
  });
  if (duplicate) return false;

  const id = task.id;
  const downloads = () => useDownloadsStore.getState();
  const unlisten = await listen<DownloadPhase>("wine-install:phase", e =>
    downloads().update(id, { phase: e.payload })
  );
  try {
    await backend.wine.install(reinstall);
    downloads().succeed(id);
    message.success(t("wine.installed"));
    return true;
  } catch (e) {
    const reason =
      (e instanceof Error ? e.message : String(e)) || t("wine.failed");
    downloads().fail(id, reason);
    message.error(reason);
    return false;
  } finally {
    unlisten();
  }
}

/** 装 Rosetta 2（会弹系统的管理员密码框）。装好返回 true */
export async function installRosetta(): Promise<boolean> {
  const loading = message.loading(t("wine.rosettaInstalling"), { duration: 0 });
  try {
    await backend.wine.installRosetta();
    message.success(t("wine.rosettaInstalled"));
    return true;
  } catch (e) {
    message.error(
      t("wine.rosettaFailed", {
        reason: e instanceof Error ? e.message : String(e)
      })
    );
    return false;
  } finally {
    loading.destroy();
  }
}

/**
 * 启动游戏前确认 Wine 能用：Apple 芯片上没有 Rosetta 2 就问要不要装（装好后需要用户再点一次启动）；
 * 自带的 Wine 还没解出来就当场解（第一次约半分钟），前缀没初始化就当场初始化。
 * 返回 false 表示这次别启动了。Windows 上 `required` 为 false，直接放行。
 */
export async function ensureWineReady(): Promise<boolean> {
  let status: WineStatus;
  try {
    status = await backend.wine.status();
  } catch (e) {
    console.warn("Wine status failed:", e);
    return true;
  }
  if (!status.required) return true;

  if (!status.rosetta) {
    dialog.info({
      title: t("wine.rosettaTitle"),
      content: t("wine.rosettaContent"),
      positiveText: t("wine.rosettaInstall"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => {
        void installRosetta();
      }
    });
    return false;
  }

  if (!status.installed) {
    if (status.customPath) {
      message.error(t("wine.customMissing", { path: status.customPath }));
      return false;
    }
    if (!status.bundledVersion) {
      message.error(t("wine.notBundled"));
      return false;
    }
    if (wineInstalling()) {
      message.info(t("wine.stillInstalling"));
      return false;
    }
    // 装好时前缀也初始化好了
    const loading = message.loading(t("wine.installing"), { duration: 0 });
    try {
      return await installWineAsTask();
    } finally {
      loading.destroy();
    }
  }

  if (!status.prefixReady) {
    const msg = message.loading(t("wine.preparing"), { duration: 0 });
    try {
      await backend.wine.preparePrefix();
    } catch (e) {
      message.error(
        t("wine.prepareFailed", {
          reason: e instanceof Error ? e.message : String(e)
        })
      );
      return false;
    } finally {
      msg.destroy();
    }
  }
  return true;
}

/** 装原版游戏时顺带把自带的 Wine 解出来（没有、也没在装时才装；不等它装完） */
export async function installWineIfMissing(): Promise<void> {
  try {
    const status = await backend.wine.status();
    if (
      !status.required ||
      status.installed ||
      status.customPath ||
      !status.bundledVersion ||
      !status.rosetta ||
      wineInstalling()
    )
      return;
    void installWineAsTask();
  } catch (e) {
    console.warn("Wine status failed:", e);
  }
}
