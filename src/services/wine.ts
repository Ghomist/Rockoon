import { listen } from "@tauri-apps/api/event";

import backend from "@/backend";
import { t } from "@/i18n";
import { useDownloadsStore } from "@/stores/downloads";
import { dialog, message } from "@/utils/ui/feedback";

/**
 * Wine 运行时（macOS）。
 *
 * Ballance 是 32 位 Windows 游戏，在 Mac 上靠 Wine 跑：启动器把 Wine 装在自己的数据目录里
 * （也可以用 /Applications 里现成的，或用户指定的），所有游戏实例共用一个 Wine 前缀。
 * 安装和原版游戏一样是「下载任务」页里的后台任务（kind: "wine"），走 game-install:* 事件。
 * 后端见 src-tauri/src/commands/wine.rs。
 */

/**
 * 默认安装的 Wine 11.18：Gcenx 的 macOS 构建（x86_64，Apple 芯片上经 Rosetta 2 运行；
 * 带新 WoW64，能跑 32 位程序）。WineHQ 的 Homebrew cask 已在 2026-09 被停用。
 *
 * 下载源按顺序试，一个下载失败或校验不过就换下一个：
 * 1. ballance-mac-bundle 发布的精简包（去掉了用不到的 Gecko/Mono、带许可证，小一半多），
 *    和 Ballance.app 里的是同一份；
 * 2. Gcenx 的原版构建。
 * 换版本时一起改，并实际跑一遍游戏。`size` 是第一个源的大小（进度与提示用）。
 */
export const WINE_RUNTIME = {
  version: "11.18",
  size: 78898056,
  sources: [
    {
      url: "https://github.com/CHHC-L/ballance-mac-bundle/releases/download/v1.0.0/wine-runtime-11.18-osx64.tar.xz",
      sha256: "3618799802c6f3dcd577d86e7504c4e84188942dad632308937ce08f62234008"
    },
    {
      url: "https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.18/wine-devel-11.18-osx64.tar.xz",
      sha256: "aa0ea4c82e636ae7bca2076387cb0a5affa26509ad13f119ecd0d62bd7ba6f82"
    }
  ]
} as const;

const TASK_KEY = "wine:runtime";

/** 占位任务 id：后端 id 要等 start 返回才拿到，先拿它登记任务（拿到后 update 替换） */
let taskSeq = 0;

/** Wine 正在安装吗（下载任务里有没有进行中的） */
export function wineInstalling(): boolean {
  return useDownloadsStore.getState().findByKey(TASK_KEY)?.status === "running";
}

/**
 * 把一次 Wine 安装登记成「下载任务」并跑完它（`archive` 给了就用本地压缩包，不下载）。
 * 已经有安装任务在跑时直接返回 false；装好返回 true，失败返回 false（任务已标成失败）。
 */
export async function installWineAsTask(archive?: string): Promise<boolean> {
  const { task, duplicate } = useDownloadsStore.getState().begin({
    id: `wine-${++taskSeq}`,
    key: TASK_KEY,
    kind: "wine",
    title: archive
      ? t("wine.taskTitleLocal")
      : t("wine.taskTitle", { version: WINE_RUNTIME.version }),
    target: t("wine.taskTarget"),
    total: archive ? 0 : WINE_RUNTIME.size,
    cancellable: true,
    retry: () => void installWineAsTask(archive)
  });
  if (duplicate) return false;

  let id = task.id;
  const downloads = () => useDownloadsStore.getState();
  const unlisten: (() => void)[] = [];
  try {
    unlisten.push(
      await listen<GameInstallProgress>("game-install:progress", e => {
        if (e.payload.id !== id) return;
        downloads().progress(id, e.payload.downloaded, e.payload.total);
        if (e.payload.phase !== "done")
          downloads().update(id, { phase: e.payload.phase });
      })
    );
    let settle: (payload: GameInstallComplete) => void = () => {};
    const completed = new Promise<GameInstallComplete>(resolve => {
      settle = resolve;
    });
    unlisten.push(
      await listen<GameInstallComplete>("game-install:complete", e => {
        if (e.payload.id === id) settle(e.payload);
      })
    );

    const backendId = await backend.wine.startInstall(
      archive ? { archive } : { sources: [...WINE_RUNTIME.sources] }
    );
    // 任务 id 换成后端的，取消才能真的中断这次下载
    downloads().update(id, { id: backendId });
    id = backendId;

    const result = await completed;
    if (!result.success) {
      const reason = result.error || t("wine.failed");
      downloads().fail(id, reason);
      message.error(reason);
      return false;
    }
    downloads().succeed(id);
    message.success(t("wine.installed"));
    return true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    downloads().fail(id, reason);
    message.error(reason || t("wine.failed"));
    return false;
  } finally {
    unlisten.forEach(fn => fn());
  }
}

/**
 * 启动游戏前确认 Wine 能用：没装就问要不要装（装好后需要用户再点一次启动），
 * 前缀没初始化就当场初始化（第一次约 20 秒）。返回 false 表示这次别启动了。
 * Windows 上 `required` 为 false，直接放行。
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
    dialog.error({
      title: t("wine.rosettaTitle"),
      content: t("wine.rosettaContent"),
      positiveText: t("common.dialog.confirm")
    });
    return false;
  }

  if (!status.installed) {
    if (wineInstalling()) {
      message.info(t("wine.stillInstalling"));
      return false;
    }
    if (status.source === "custom" || status.customPath) {
      message.error(t("wine.customMissing", { path: status.customPath ?? "" }));
      return false;
    }
    dialog.info({
      title: t("wine.missingTitle"),
      content: t("wine.missingContent"),
      positiveText: t("wine.installNow"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => {
        void installWineAsTask();
      }
    });
    return false;
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

/** 装原版游戏时顺带把 Wine 也装上（没有、也没在装时才装；不等它装完） */
export async function installWineIfMissing(): Promise<void> {
  try {
    const status = await backend.wine.status();
    if (!status.required || status.installed || wineInstalling()) return;
    void installWineAsTask();
  } catch (e) {
    console.warn("Wine status failed:", e);
  }
}
