import { useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as browseDir } from "@tauri-apps/plugin-dialog";

import backend from "@/backend";
import { t } from "@/i18n";
import { hubReady, hubUrl } from "@/services/hub";
import { useAppStore } from "@/stores/app";
import { useDownloadsStore } from "@/stores/downloads";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { fetchPatches, installPatchAsTask } from "@/services/patches";
import { message } from "@/utils/ui/feedback";

/** 装原版游戏时顺带装的补丁（用户可在弹窗里改） */
export interface PatchChoice {
  player: boolean;
  bmlplus: boolean;
  bml: boolean;
}

/** 默认勾选新 Player + BML+（BML+ 的前提就是新 Player），BML 不勾 */
export const DEFAULT_PATCH_CHOICE: PatchChoice = {
  player: true,
  bmlplus: true,
  bml: false
};

export interface PatchOptionsState {
  open: boolean;
  value: PatchChoice;
  onChange: (value: PatchChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 勾选项 → 下载站的补丁组件键；顺序即安装顺序（BML+ 依赖新 Player） */
const PATCH_ORDER: { flag: keyof PatchChoice; key: string }[] = [
  { flag: "player", key: "player-vc6" },
  { flag: "bmlplus", key: "bmlplus" },
  { flag: "bml", key: "bml" }
];

/** 占位任务 id：后端 id 要等 start 返回才拿到，先拿它登记任务（拿到后 update 替换） */
let taskSeq = 0;

/**
 * 「安装原版游戏」流程：先问要不要顺带装补丁（默认 新 Player + BML+）→ 选目标
 * 文件夹 → 从下载站下载解压 → 设为当前实例 → 按勾选依次安装补丁。
 *
 * 首次引导（没有可用游戏时）和设置里「换文件夹 / 装新游戏」共用这一套；
 * 下载本身是「下载任务」页里的后台任务（见 stores/downloads），这里只在装完时弹一条
 * 结果，optionsDialog 仍是补丁勾选弹窗。
 */
export function useVanillaInstall(): {
  start: () => void;
  busy: boolean;
  optionsDialog: PatchOptionsState;
} {
  const [busy, setBusy] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [choice, setChoice] = useState<PatchChoice>(DEFAULT_PATCH_CHOICE);

  /** 点「安装原版游戏」：先弹补丁选项（默认勾好），确认后才选目录 */
  const start = useCallback(() => {
    if (busy) return;
    setOptionsOpen(true);
  }, [busy]);

  /** 真正开始：已经选好目录，装游戏 + （可选）装补丁都在这里跑完 */
  const run = async (folder: string, picked: PatchChoice) => {
    setBusy(true);
    let id = "";
    try {
      // 先把下载站域名探一次（被运营商拦 .top 时自动切别名），再把 URL 交给 Rust 下载器
      await hubReady();
      const url = hubUrl("/game/download");
      const { task, duplicate } = useDownloadsStore.getState().begin({
        id: `game-${++taskSeq}`,
        key: `game:${url}:${folder}`,
        kind: "game",
        title: t("game.install"),
        target: folder,
        cancellable: true,
        retry: () => void run(folder, picked)
      });
      // 同一个目录已经在装了：不重复下载
      if (duplicate) return;
      id = task.id;

      const unlisten: (() => void)[] = [
        await listen<GameInstallProgress>("game-install:progress", e => {
          if (e.payload.id !== id) return;
          const downloads = useDownloadsStore.getState();
          downloads.progress(id, e.payload.downloaded, e.payload.total);
          if (e.payload.phase !== "done")
            downloads.update(id, { phase: e.payload.phase });
        })
      ];
      try {
        let settleComplete: (payload: GameInstallComplete) => void = () => {};
        const completed = new Promise<GameInstallComplete>(resolve => {
          settleComplete = resolve;
        });
        unlisten.push(
          await listen<GameInstallComplete>("game-install:complete", e => {
            if (e.payload.id === id) settleComplete(e.payload);
          })
        );

        const backendId = await backend.startInstall(url, folder);
        // 任务 id 换成后端的，取消才能真的中断这次下载
        useDownloadsStore.getState().update(id, { id: backendId });
        id = backendId;

        const result = await completed;
        const target = result.target ?? folder;
        if (!result.success) {
          const reason = result.error || t("game.failed");
          useDownloadsStore.getState().fail(id, reason);
          message.error(reason);
          return;
        }

        // 装好就把它设为当前实例，用户不用再去手动选一次
        useDownloadsStore.getState().succeed(id);
        if (await useAppStore.getState().loadInstance(target)) {
          usePrefStore.setState({ instancePath: target });
          await useProfilesStore.getState().load();
        }

        // 顺带装勾选的补丁：失败不影响已经装好的游戏，只提示一次
        const installedPatches: string[] = [];
        try {
          const components = await fetchPatches();
          for (const { flag, key } of PATCH_ORDER) {
            if (!picked[flag]) continue;
            const component = components.find(c => c.key === key);
            if (!component || !component.package_id) continue;
            if (await installPatchAsTask(component, target, null))
              installedPatches.push(`${component.name} ${component.latest}`);
          }
        } catch (patchError) {
          console.warn("Patch install after game install failed:", patchError);
          message.error(t("game.patchFailed"));
        }

        message.success(
          installedPatches.length
            ? t("game.installedWithPatches", {
                path: target,
                patches: installedPatches.join("、")
              })
            : t("game.installed", { path: target })
        );
      } finally {
        unlisten.forEach(fn => fn());
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (id) useDownloadsStore.getState().fail(id, reason);
      message.error(reason || t("game.failed"));
    } finally {
      setBusy(false);
    }
  };

  const optionsDialog: PatchOptionsState = {
    open: optionsOpen,
    value: choice,
    onChange: setChoice,
    onConfirm: async () => {
      setOptionsOpen(false);
      const folder = await browseDir({
        directory: true,
        title: t("game.pickTarget")
      });
      if (!folder) return;
      await run(folder, choice);
    },
    onCancel: () => setOptionsOpen(false)
  };

  return { start, busy, optionsDialog };
}
