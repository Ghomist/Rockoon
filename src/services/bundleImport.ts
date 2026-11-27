import { basename, join } from "@tauri-apps/api/path";

import backend from "@/backend";
import { t } from "@/i18n";
import { importFromUrl } from "@/services/brp";
import { buildQueueForPackages } from "@/services/deepLinkImport";
import { hubFetch } from "@/services/hub";
import {
  checkResourceUpdates,
  resourceKey,
  useResourceUpdatesStore
} from "@/services/resourceUpdates";
import { useAppStore } from "@/stores/app";
import { message } from "@/utils/ui/feedback";

/**
 * 下载站「地图合集」的一键安装（`rockoon://bundle?id=<合集 id>`）。
 *
 * 合集 = 下载站上的一组地图。装法：在 `ModLoader/Maps/` 下建一个以合集命名的文件夹，
 * 每张地图走原来那条 BRP 导入流水线（下载任务、进度、取消都一样），装好后挪进这个文件夹；
 * 地图依赖的模组照常装进 `ModLoader/Mods/`。和下载站「下载 ZIP」解压到 Maps 的结果一致。
 *
 * 合集清单来自 `GET /bundles/{id}/install`（规则在下载站 `app/api/routes/bundles.py`）。
 */

interface BundleManifest {
  id: number;
  name: string;
  /** 下载站已经把文件名里不能用的字符处理过了；这里再兜一次底 */
  folder: string;
  items: {
    id: number;
    name: string | null;
    category: string;
    /** 当前版本里的地图文件名（老数据可能为空） */
    file_name: string;
    dependencies: string[];
  }[];
}

/** 已经是最新版就不重下：反查最多等这么久，等不到就当没装过 */
const EXISTING_CHECK_TIMEOUT_MS = 3000;

/** Windows 文件名里不能用的字符换成 `_`，去掉结尾的点和空格 */
export function safeFolderName(name: string, fallback: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  const trimmed = cleaned.replace(/[. ]+$/, "").slice(0, 80);
  return trimmed || fallback;
}

async function fetchBundle(id: number): Promise<BundleManifest> {
  const res = await hubFetch(`/bundles/${id}/install`);
  return (await res.json()) as BundleManifest;
}

/** 合集文件夹里已经是最新版的地图（按资源 id）：再装一遍合集时跳过它们 */
async function upToDateInFolder(
  instancePath: string,
  folder: string
): Promise<Set<number>> {
  await Promise.race([
    checkResourceUpdates(instancePath),
    new Promise<void>(resolve => {
      setTimeout(resolve, EXISTING_CHECK_TIMEOUT_MS);
    })
  ]);
  const prefix = resourceKey(folder).replace(/\/?$/, "/");
  const ids = new Set<number>();
  for (const r of Object.values(useResourceUpdatesStore.getState().resources)) {
    if (r.hub?.is_latest && resourceKey(r.path).startsWith(prefix)) {
      ids.add(r.hub.package.id);
    }
  }
  return ids;
}

/** 把装好的文件挪进合集文件夹（同名的旧文件先删掉，相当于覆盖更新） */
async function moveInto(paths: string[], folder: string): Promise<void> {
  for (const path of paths) {
    const dest = await join(folder, await basename(path));
    if (resourceKey(dest) === resourceKey(path)) continue;
    if (await backend.exists(dest)) await backend.delete(dest);
    await backend.rename(path, dest);
  }
}

export async function startBundleImport(
  bundleId: number,
  nameHint?: string
): Promise<void> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    message.error(t("brp.error.noInstance"));
    return;
  }

  let manifest: BundleManifest;
  try {
    manifest = await fetchBundle(bundleId);
  } catch (e) {
    message.error(
      t("brp.bundle.fetchFailed", {
        reason: e instanceof Error ? e.message : String(e)
      })
    );
    return;
  }
  const maps = manifest.items.filter(item => item.category === "map");
  if (maps.length === 0) {
    message.warning(t("brp.bundle.empty"));
    return;
  }

  const title = manifest.name || nameHint || `#${bundleId}`;
  const mapsRoot = await join(instance.path, "ModLoader", "Maps");
  const folder = await join(
    mapsRoot,
    safeFolderName(manifest.folder || manifest.name, `bundle-${bundleId}`)
  );
  await backend.mkdir(folder);

  const skip = await upToDateInFolder(instance.path, folder);
  const queue = (await buildQueueForPackages(maps.map(m => m.id))).filter(
    task => task.isDependency || !skip.has(task.packageId)
  );
  const fileNames = new Map(maps.map(m => [m.id, m.file_name]));

  if (!queue.some(task => !task.isDependency)) {
    message.success(t("brp.bundle.upToDate", { name: title }));
    return;
  }
  message.info(
    t("brp.bundle.start", {
      name: title,
      count: queue.filter(task => !task.isDependency).length
    })
  );

  let ok = 0;
  let failed = 0;
  for (const task of queue) {
    // BRP 先装到 Maps/ 根下再挪进合集文件夹：根下已有同名文件（玩家自己的那份）时先挪开，装完放回去
    let parked: { from: string; to: string } | undefined;
    const fileName = fileNames.get(task.packageId);
    if (!task.isDependency && fileName) {
      const atRoot = await join(mapsRoot, fileName);
      if (await backend.exists(atRoot)) {
        parked = { from: atRoot, to: `${atRoot}.rockoon-bundle-${Date.now()}` };
        await backend.rename(parked.from, parked.to);
      }
    }
    try {
      const outcome = await importFromUrl(task.url, undefined, {
        title: task.name,
        isDependency: task.isDependency,
        quiet: true, // 逐个成功不弹提示，最后汇总一条
        onInstalled: task.isDependency
          ? undefined
          : result => moveInto(result.installedPaths, folder)
      });
      if (!task.isDependency) {
        if (outcome === "done" || outcome === "duplicate") ok += 1;
        else failed += 1;
      }
      if (outcome === "cancelled") break;
    } finally {
      if (parked) {
        await backend
          .rename(parked.to, parked.from)
          .catch(err => console.warn("[bundle] 放回原文件失败：", err));
      }
    }
  }

  useAppStore.getState().triggerRefresh();
  if (failed === 0) {
    message.success(
      t("brp.bundle.done", { name: title, count: ok, folder: manifest.folder })
    );
  } else {
    message.warning(t("brp.bundle.partial", { name: title, ok, failed }));
  }
}
