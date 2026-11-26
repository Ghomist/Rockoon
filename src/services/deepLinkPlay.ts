import { t } from "@/i18n";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import {
  checkRunningInstance,
  killInstance,
  launchMap
} from "@/services/launcher";
import { confirmTasAutoplayOff } from "@/services/tasGuard";
import { dialog, message } from "@/utils/ui/feedback";

/**
 * 深链「试玩」：`rockoon://play?map=<相对 ModLoader/Maps 的路径>`。
 *
 * 地图编辑器（Ballance Vibe Mapping）把导出的 .nmo 直接写进游戏目录的 ModLoader/Maps，
 * 再用这条深链叫 Rockoon 用当前实例启动这张图 —— 改一下、导出、试玩，循环要快，
 * 所以不弹「是否启动地图」（浏览器那边已经问过一次），游戏开着就问一句「重开」。
 */

/** 只认 ModLoader/Maps 下面的相对路径（可以带子目录），拒绝跳出去的路径 */
export function normalizeMapPath(raw: string): string | null {
  const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (/^[a-z]:$/i.test(parts[0]) || raw.startsWith("/")) return null;
  if (parts.some(p => p === "." || p === "..")) return null;
  if (!/\.(nmo|cmo)$/i.test(parts[parts.length - 1])) return null;
  return parts.join("/");
}

/** 游戏正开着：问要不要关掉重开。返回 false = 不启动 */
function confirmRestart(name: string): Promise<boolean> {
  return new Promise(resolve => {
    dialog.warning({
      title: t("deepLinkPlay.restartTitle"),
      content: t("deepLinkPlay.restartBody", { name }),
      positiveText: t("deepLinkPlay.restart"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

export async function playFromDeepLink(raw: string | null): Promise<void> {
  const map = raw ? normalizeMapPath(raw) : null;
  if (!map) {
    message.warning(t("deepLinkPlay.invalid", { map: raw ?? "" }));
    return;
  }
  await playMap(map);
}

/**
 * 用当前实例启动 ModLoader/Maps 下的地图（`map` 已经过 normalizeMapPath）。
 * 深链和内嵌的制图器都走这里。返回 true = 已经交给游戏启动
 */
export async function playMap(map: string): Promise<boolean> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    message.warning(t("deepLinkPlay.noInstance"));
    return false;
  }
  const abs = `${instance.path.replace(/[\\/]+$/, "")}/ModLoader/Maps/${map}`;
  if (!(await backend.exists(abs))) {
    dialog.warning({
      title: t("deepLinkPlay.notFoundTitle"),
      content: t("deepLinkPlay.notFoundBody", {
        map,
        path: instance.path
      })
    });
    return false;
  }
  // 直接进图靠内置的 RockoonIO 模组（BMLPlus 模组）读 ROCKOON_STARTUP；别的加载器进不了图
  if (instance.modLoaderType !== "bmlp" || !instance.modLoaderEnabled) {
    dialog.warning({
      title: t("deepLinkPlay.needBmlpTitle"),
      content: t("deepLinkPlay.needBmlpBody", { map })
    });
    return false;
  }
  if (await checkRunningInstance()) {
    if (!(await confirmRestart(map))) return false;
    await killInstance();
    // 杀进程失败会弹窗并保留运行状态：这时别再开第二个
    if (useAppStore.getState().runningInstancePid) return false;
  }
  if (!(await confirmTasAutoplayOff(instance.path))) return false;
  await launchMap(abs);
  return true;
}
