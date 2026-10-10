import backend from "@/backend";
import { t } from "@/i18n";
import {
  applyRestore,
  autoplayEnabled,
  autoplayTarget,
  clearPendingRestore,
  disableAutoplay,
  loadPendingRestore,
  looksLikeBallanceTas
} from "@/tas/play";
import { dialog, message } from "@/utils/ui/feedback";

/** Ballance 的进程映像名（不支持多开：同时只能有一个）。 */
export const PLAYER_IMAGE = "Player.exe";

/**
 * 把 TAS 编辑器「一键播放」改过的 BallanceTAS 配置改回原值（见 `rememberRestore`）。
 *
 * 只在**没有 Player.exe 在跑**时才动：游戏只在启动时读配置，但 BML+ 退出时可能把内存里的
 * 配置写回文件，游戏没退干净就改，会被它覆盖回去。暂时改不了就留着，下次再试
 * （停止游戏后、游戏自己退出后、编辑器打开时、正常启动游戏前都会试一次）。
 * 返回是否真的改回去了。
 */
export async function restoreTasConfig(): Promise<boolean> {
  const pending = loadPendingRestore();
  if (!pending) return false;
  const running = await backend
    .findProcesses(PLAYER_IMAGE)
    .catch(() => [0] as number[]);
  if (running.length > 0) return false;
  try {
    const cfg = await backend.readModConfig(pending.cfgPath);
    await backend.saveModConfig(
      pending.cfgPath,
      applyRestore(cfg, pending.entries)
    );
    clearPendingRestore();
    message.info(t("tasGuard.restored"));
    return true;
  } catch (e) {
    // 文件没了 / 读写失败：记录留着下次再试；正常启动前还有保底询问
    console.warn("Failed to restore BallanceTAS config:", e);
    return false;
  }
}

/**
 * 正常启动游戏（主页「启动游戏」、自制地图）前的保底：
 * 先把一键播放没来得及改回去的配置改回去；BallanceTAS 若仍开着「启动时自动播放」，
 * 问玩家要不要关掉 —— 否则一开游戏就自动进关卡、回放录像。
 *
 * 返回 `false` = 玩家把询问框关掉了，调用方不要启动。
 */
export async function confirmTasAutoplayOff(
  instancePath: string
): Promise<boolean> {
  await restoreTasConfig();
  const cfgPath = `${instancePath}/ModLoader/Configs/BallanceTAS.cfg`;
  let cfg: ModConfig;
  try {
    cfg = await backend.readModConfig(cfgPath);
  } catch {
    return true; // 没装 BallanceTAS
  }
  if (!looksLikeBallanceTas(cfg) || !autoplayEnabled(cfg)) return true;

  const { project, level } = autoplayTarget(cfg);
  return new Promise<boolean>(resolve => {
    dialog.warning({
      title: t("tasGuard.title"),
      content: t("tasGuard.body", {
        project: project || t("tasGuard.anyProject"),
        level: level && level !== "None" ? level : t("tasGuard.noLevel")
      }),
      positiveText: t("tasGuard.disable"),
      negativeText: t("tasGuard.keep"),
      onPositiveClick: async () => {
        try {
          await backend.saveModConfig(cfgPath, disableAutoplay(cfg));
          message.success(t("tasGuard.disabled"));
        } catch (e) {
          message.error(String(e));
        }
        resolve(true);
      },
      onNegativeClick: () => resolve(true),
      // 点了确定 / 取消之后也会走到这里，但 Promise 只认第一次 resolve
      onClose: () => resolve(false)
    });
  });
}
