import { useCallback, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as browseDir } from "@tauri-apps/plugin-dialog";

import backend from "@/backend";
import type { ImportPhase } from "@/components/ImportProgressDialog";
import { t } from "@/i18n";
import { hubReady, hubUrl } from "@/services/hub";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { fetchPatches, installPatch } from "@/services/patches";
import { message } from "@/utils/ui/feedback";

export interface VanillaInstallDialog {
  open: boolean;
  phase: ImportPhase;
  percent: number;
  error: string;
  resultText: string;
  onCancel: () => void;
  onClose: () => void;
  /** 阶段文案：装游戏与装补丁各一套，直接展开给 ImportProgressDialog */
  labels: Partial<Record<ImportPhase, string>>;
}

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

const GAME_LABELS: Partial<Record<ImportPhase, string>> = {
  connecting: t("game.connecting"),
  downloading: t("game.downloading"),
  importing: t("game.extracting"),
  done: t("game.done")
};

const PATCH_LABELS: Partial<Record<ImportPhase, string>> = {
  connecting: t("patches.connecting"),
  downloading: t("patches.downloading"),
  importing: t("patches.extracting"),
  done: t("patches.done")
};

/**
 * 「安装原版游戏」流程：先问要不要顺带装补丁（默认 新 Player + BML+）→ 选目标
 * 文件夹 → 从下载站下载解压 → 设为当前实例 → 按勾选依次安装补丁。
 *
 * 首次引导（没有可用游戏时）和设置里「换文件夹 / 装新游戏」共用这一套；
 * 返回的 dialog 展开给 <ImportProgressDialog />，optionsDialog 给
 * <PatchOptionsDialog />。
 */
export function useVanillaInstall(): {
  start: () => void;
  busy: boolean;
  dialog: VanillaInstallDialog;
  optionsDialog: PatchOptionsState;
} {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [choice, setChoice] = useState<PatchChoice>(DEFAULT_PATCH_CHOICE);
  const [stage, setStage] = useState<"game" | "patch">("game");
  const [phase, setPhase] = useState<ImportPhase>("connecting");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [resultText, setResultText] = useState("");
  const taskId = useRef("");

  const onCancel = useCallback(() => {
    if (taskId.current) void backend.cancelInstall(taskId.current);
  }, []);

  const onClose = useCallback(() => {
    setOpen(false);
    setError("");
    setResultText("");
  }, []);

  /** 点「安装原版游戏」：先弹补丁选项（默认勾好），确认后才选目录 */
  const start = useCallback(() => {
    if (busy) return;
    setOptionsOpen(true);
  }, [busy]);

  const run = useCallback(async (picked: PatchChoice) => {
    const folder = await browseDir({
      directory: true,
      title: t("game.pickTarget")
    });
    if (!folder) return;

    setOpen(true);
    setStage("game");
    setPhase("connecting");
    setPercent(0);
    setError("");
    setResultText("");
    setBusy(true);

    const unlisten = [
      await listen<GameInstallProgress>("game-install:progress", e => {
        setPhase(e.payload.phase);
        setPercent(e.payload.percent);
      }),
      await listen<GameInstallComplete>("game-install:complete", async e => {
        unlisten.forEach(fn => fn());
        const { success, error: message_, target } = e.payload;

        if (!success) {
          setError(message_ || t("game.failed"));
          setBusy(false);
          return;
        }

        // 装好就把它设为当前实例，用户不用再去手动选一次
        if (target) {
          const ok = await useAppStore.getState().loadInstance(target);
          if (ok) {
            usePrefStore.setState({ instancePath: target });
            await useProfilesStore.getState().load();
          }
        }

        // 顺带装勾选的补丁：失败不影响已经装好的游戏，只提示一次
        const installedPatches: string[] = [];
        if (target) {
          try {
            const components = await fetchPatches();
            setStage("patch");
            for (const { flag, key } of PATCH_ORDER) {
              if (!picked[flag]) continue;
              const component = components.find(c => c.key === key);
              if (!component || !component.package_id) continue;
              setPhase("connecting");
              setPercent(0);
              await installPatch(component, target, null, {
                onPhase: p => setPhase(p),
                onPercent: p => setPercent(p),
                onTaskId: id => {
                  taskId.current = id;
                }
              });
              installedPatches.push(`${component.name} ${component.latest}`);
            }
          } catch (patchError) {
            console.warn("Patch install after game install failed:", patchError);
            message.error(t("game.patchFailed"));
          }
        }

        setStage("game");
        setPhase("done");
        setPercent(100);
        setResultText(
          installedPatches.length
            ? t("game.installedWithPatches", {
                path: target ?? folder,
                patches: installedPatches.join("、")
              })
            : t("game.installed", { path: target ?? folder })
        );
        setBusy(false);
      })
    ];

    try {
      // 先把下载站域名探一次（被运营商拦 .top 时自动切别名），再把 URL 交给 Rust 下载器
      await hubReady();
      taskId.current = await backend.startInstall(hubUrl("/game/download"), folder);
    } catch (e) {
      unlisten.forEach(fn => fn());
      setError(String(e));
      setBusy(false);
    }
  }, []);

  const optionsDialog: PatchOptionsState = {
    open: optionsOpen,
    value: choice,
    onChange: setChoice,
    onConfirm: () => {
      setOptionsOpen(false);
      void run(choice);
    },
    onCancel: () => setOptionsOpen(false)
  };

  return {
    start,
    busy,
    optionsDialog,
    dialog: {
      open,
      phase,
      percent,
      error,
      resultText,
      onCancel,
      onClose,
      labels: stage === "patch" ? PATCH_LABELS : GAME_LABELS
    }
  };
}
