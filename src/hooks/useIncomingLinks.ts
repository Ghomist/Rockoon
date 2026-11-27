import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getCurrent as getCurrentDeepLink,
  onOpenUrl
} from "@tauri-apps/plugin-deep-link";
import backend from "@/backend";
import { t } from "@/i18n";
import { buildImportQueue, packageIdFromUrl } from "@/services/deepLinkImport";
import { playFromDeepLink } from "@/services/deepLinkPlay";
import { MAP_EDITOR_ROUTE, openBvmLink } from "@/services/mapEditor";
import { importFromFile, importFromUrl } from "@/services/brp";
import { installedCopiesOf, resourceKey } from "@/services/resourceUpdates";
import { askSkyTarget } from "@/services/sky";
import { useAppStore } from "@/stores/app";
import { dialog, message } from "@/utils/ui/feedback";

/**
 * 把窗口提到最前（还原 → 显示 → 抢焦点），失败不阻塞后续处理：
 * 单实例回调也会提一次，两边都做是怕浏览器拉起的时机太早、前端监听还没挂上。
 */
async function bringToFront() {
  try {
    await getCurrentWindow().unminimize();
    await backend.showWindow();
  } catch {
    /* window API not ready yet — continue */
  }
}

/** 路径最后一段（Windows / POSIX 都要能分） */
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * 下载站上的地图本地已经有了：问一句要不要覆盖重下。
 * 本地文件可能是被改过名的（反查靠 hash，不靠名字），对不上时把两个名字都摆出来，
 * 并在确认后把旧名字那份删掉 —— 不然同一个地图会在列表里出现两次。
 */
function askRedownload(opts: {
  localName: string;
  hubName: string;
  version: number;
}): Promise<boolean> {
  const renamed = opts.localName !== opts.hubName;
  return new Promise<boolean>(resolve => {
    dialog.create({
      title: t("brp.existing.title"),
      content: renamed
        ? t("brp.existing.bodyRenamed", {
            local: opts.localName,
            hub: opts.hubName,
            version: opts.version
          })
        : t("brp.existing.body", {
            name: opts.localName,
            version: opts.version
          }),
      positiveText: renamed
        ? t("brp.existing.confirmRename")
        : t("brp.existing.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

/**
 * 外部送进来的东西：拖进窗口的 .brp / .zip，以及 `rockoon://` 深链
 * （import = 下载站一键安装，play = 制图器试玩，bvm = 浏览器里的 BVM 交来的地图）。
 */
export function useIncomingLinks() {
  const navigate = useNavigate();
  /**
   * 深链点进来是「一键安装」：先把依赖展开成安装队列（依赖在前、主资源在后，见
   * services/deepLinkImport），再按顺序逐个导入 —— 每个资源都在「下载任务」里登记成
   * 后台任务，开始/进度/结束全写进任务，只在开始与结束时弹 message，没有进度弹窗。
   * `name` 是下载站带来的资源名（可选），没带就用下载站返回的资源名。
   */
  const startDeepLinkImport = useCallback(
    async (url: string, name?: string) => {
      try {
        const queue = await buildImportQueue(url);
        if (queue.length === 0) return;

        // 这个地图本地已经装过（文件 hash 反查到同一个资源）：先问一句，别白下一遍
        const mainTask = queue.find(task => !task.isDependency);
        const instancePath = useAppStore.getState().selectedInstanceData?.path;
        // 本地那份的名字和下载站不一致时，记下来（装完把旧名字那份删掉）
        let stalePath: string | undefined;
        if (mainTask && instancePath) {
          const packageId = packageIdFromUrl(mainTask.url);
          const existing = packageId
            ? (await installedCopiesOf(instancePath, packageId)).find(
                r => r.kind === "map"
              )
            : undefined;
          if (existing) {
            const localName = baseName(existing.path).replace(
              /\.disable$/i,
              ""
            );
            const hubName = existing.hub.asset.name;
            const go = await askRedownload({
              localName,
              hubName,
              version: existing.hub.version
            });
            if (!go) return;
            if (localName !== hubName) stalePath = existing.path;
          }
        }

        // 天空盒包的文件名是 Sky_X_<方位>.bmp（X 是占位符）：装之前问用户装到哪一关
        let skyLetter: SkyLetter | undefined;
        if (queue.some(task => task.category === "sky")) {
          const letter = await askSkyTarget();
          if (letter === null) return; // 用户取消了安装
          skyLetter = letter;
        }

        for (const task of queue) {
          const outcome = await importFromUrl(task.url, skyLetter, {
            title: task.isDependency ? task.name : name || task.name,
            isDependency: task.isDependency,
            // 名字对齐：新文件已经按下载站的名字装好了，旧名字那份就没用了
            onInstalled:
              stalePath && !task.isDependency
                ? async result => {
                    const keep = new Set(
                      result.installedPaths.map(resourceKey)
                    );
                    if (stalePath && !keep.has(resourceKey(stalePath))) {
                      await backend.delete(stalePath).catch(() => {});
                    }
                  }
                : undefined
          });
          // 用户取消了就断掉整条依赖链（失败或去重命中都继续装下一个）
          if (outcome === "cancelled") break;
        }
      } catch (e) {
        message.error(
          t("brp.import.failed", {
            reason: e instanceof Error ? e.message : String(e)
          })
        );
      }
    },
    []
  );
  // 深链处理里要切页面，但 useNavigate 每次切页都给新函数：放进 effect 依赖会让监听反复重挂、
  // 冷启动带进来的深链被重复处理，所以经 ref 取最新的
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // BRP drag-drop + rockoon:// deep-links.
  useEffect(() => {
    let unlistenDragDrop: (() => void) | undefined;
    let unlistenDeepLink: (() => void) | undefined;

    const handleUrl = async (raw: string) => {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "rockoon:") return;
        if (parsed.host === "bvm") {
          // 浏览器里的 BVM 交过来一张地图：在内嵌的制图器里打开，再按 action 保存 / 试玩
          await bringToFront();
          if (await openBvmLink(parsed.searchParams))
            navigateRef.current(MAP_EDITOR_ROUTE);
          return;
        }
        if (parsed.host === "play") {
          // 地图编辑器的「试玩」：地图已经写进当前实例的 ModLoader/Maps，直接启动
          await bringToFront();
          void playFromDeepLink(parsed.searchParams.get("map"));
          return;
        }
        if (parsed.host === "import") {
          await bringToFront();
          const brpUrl = parsed.searchParams.get("url");
          if (brpUrl)
            void startDeepLinkImport(
              brpUrl,
              parsed.searchParams.get("name") ?? undefined
            );
          else message.warning(t("brp.error.invalidFile"));
        }
      } catch {
        // ignore malformed URLs
      }
    };

    (async () => {
      unlistenDragDrop = await getCurrentWebview().onDragDropEvent(event => {
        if (event.payload.type === "drop") {
          const brpFiles = event.payload.paths.filter(
            p =>
              p.toLowerCase().endsWith(".brp") ||
              p.toLowerCase().endsWith(".zip")
          );
          // 拖进来的东西一个都导不了时说一声，不然看起来像没反应
          if (brpFiles.length === 0)
            message.warning(t("brp.error.invalidFile"));
          brpFiles.forEach(p => importFromFile(p));
        }
      });

      unlistenDeepLink = await onOpenUrl(urls => urls.forEach(handleUrl));
      const startup = await getCurrentDeepLink();
      if (startup) startup.forEach(handleUrl);
    })();

    return () => {
      unlistenDragDrop?.();
      unlistenDeepLink?.();
    };
  }, [startDeepLinkImport]);
}
