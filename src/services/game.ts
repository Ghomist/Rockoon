import { useCallback, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as browseDir } from "@tauri-apps/plugin-dialog";

import backend from "@/backend";
import type { ImportPhase } from "@/components/ImportProgressDialog";
import { t } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";

/** 原版游戏镜像挂在下载站上（与更新源同一个站） */
export const RESOURCE_HUB = "https://dl.ballance.top";

export interface VanillaInstallDialog {
  open: boolean;
  phase: ImportPhase;
  percent: number;
  error: string;
  resultText: string;
  onCancel: () => void;
  onClose: () => void;
}

/**
 * 「安装原版游戏」流程：选目标文件夹 → 从下载站下载 → 解压 → 设为当前实例。
 *
 * 首次引导（没有可用游戏时）和设置里「换文件夹 / 装新游戏」共用这一套；
 * 返回的 dialog 直接展开给 <ImportProgressDialog /> 渲染。
 */
export function useVanillaInstall(): {
  start: () => Promise<void>;
  busy: boolean;
  dialog: VanillaInstallDialog;
} {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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

  const start = useCallback(async () => {
    if (busy) return; // 已经在装了就别重复弹目录选择
    const folder = await browseDir({
      directory: true,
      title: t("game.pickTarget")
    });
    if (!folder) return;

    setOpen(true);
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
        setPhase("done");
        setPercent(100);
        setResultText(t("game.installed", { path: target ?? folder }));
        setBusy(false);
      })
    ];

    try {
      taskId.current = await backend.startInstall(`${RESOURCE_HUB}/game/download`, folder);
    } catch (e) {
      unlisten.forEach(fn => fn());
      setError(String(e));
      setBusy(false);
    }
  }, [busy]);

  return { start, busy, dialog: { open, phase, percent, error, resultText, onCancel, onClose } };
}
