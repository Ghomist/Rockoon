import { create } from "zustand";
import { basename, dirname, join } from "@tauri-apps/api/path";

import backend, { type ResourceFile } from "@/backend";
import { t } from "@/i18n";
import { importFromUrl } from "@/services/brp";
import { buildImportQueue, packageIdFromUrl } from "@/services/deepLinkImport";
import { hubFetch, hubReady, hubUrl } from "@/services/hub";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { message } from "@/utils/ui/feedback";

/**
 * 地图 / mod 的更新检查。
 *
 * 本地文件的 sha256（文件本身，不是 BRP 包）拿去下载站反查：能查到历史版本，就知道这是
 * 哪个资源的第几版、有没有新版，顺带拿到作者、更新日期给列表页显示。查不到的文件
 * （自己导入的、下载站没有的）什么都不显示。规则在下载站 `app/api/routes/packages.py`。
 */

export type ResourceKind = ResourceFile["kind"];

export interface HubAsset {
  name: string;
  format: string;
  size: number;
  sha256: string;
}

export interface HubMatch {
  sha256: string;
  package: {
    id: number;
    name: string | null;
    category: string;
    status: string;
    authors: { name: string; display: string; nickname: string }[];
    description: string | null;
  };
  asset: HubAsset;
  version: number;
  version_date: string | null;
  latest_version: number;
  latest_date: string | null;
  latest_note: string;
  latest_assets: HubAsset[];
  is_latest: boolean;
  has_update: boolean;
}

export interface TrackedResource extends ResourceFile {
  hub?: HubMatch;
}

export type ResourceUpdate = TrackedResource & { hub: HubMatch };

interface ResourceUpdatesState {
  /** 以 `resourceKey(路径)` 为键 */
  resources: Record<string, TrackedResource>;
  updating: boolean;
}

export const useResourceUpdatesStore = create<ResourceUpdatesState>(() => ({
  resources: {},
  updating: false
}));

/** 下载站一次最多收这么多 hash */
const LOOKUP_BATCH = 1000;
/** 启动游戏前最多等这么久，网不好也不能拖住启动 */
const LAUNCH_CHECK_TIMEOUT_MS = 2500;

/** 路径比较用的键：各页面拼出来的路径分隔符不一定一样，Windows 上大小写也不敏感 */
export const resourceKey = (path: string) =>
  path.replace(/\\/g, "/").toLowerCase();

const pendingUpdatesOf = (resources: Record<string, TrackedResource>) =>
  Object.values(resources).filter((r): r is ResourceUpdate =>
    Boolean(r.hub?.has_update)
  );

export function selectUpdates(
  resources: Record<string, TrackedResource>,
  kind?: ResourceKind
): ResourceUpdate[] {
  return pendingUpdatesOf(resources).filter(r => !kind || r.kind === kind);
}

async function lookupHashes(hashes: string[]): Promise<Map<string, HubMatch>> {
  const matches = new Map<string, HubMatch>();
  for (let i = 0; i < hashes.length; i += LOOKUP_BATCH) {
    const res = await hubFetch("/packages/by-hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: hashes.slice(i, i + LOOKUP_BATCH) })
    });
    const data = (await res.json()) as { items: HubMatch[] };
    data.items.forEach(item => matches.set(item.sha256, item));
  }
  return matches;
}

async function runCheck(instancePath: string): Promise<ResourceUpdate[]> {
  try {
    const files = await backend.hashInstanceResources(instancePath);
    const matches = await lookupHashes([...new Set(files.map(f => f.sha256))]);
    // 查的时候用户可能已经切了实例，那这份结果就作废
    if (useAppStore.getState().selectedInstanceData?.path === instancePath) {
      useResourceUpdatesStore.setState({
        resources: Object.fromEntries(
          files.map(f => [
            resourceKey(f.path),
            { ...f, hub: matches.get(f.sha256) }
          ])
        )
      });
    }
  } catch (e) {
    // 下载站连不上就当没有更新：这只是个提示，不能影响其它功能
    console.warn("Resource update check failed:", e);
  }
  return selectUpdates(useResourceUpdatesStore.getState().resources);
}

const running = new Map<string, Promise<ResourceUpdate[]>>();

/** 检查一次更新。启动时和进页面可能撞在一起，同一实例只跑一份；不会抛错 */
export function checkResourceUpdates(
  instancePath: string
): Promise<ResourceUpdate[]> {
  const existing = running.get(instancePath);
  if (existing) return existing;
  const check = runCheck(instancePath).finally(() =>
    running.delete(instancePath)
  );
  running.set(instancePath, check);
  return check;
}

/** 启动游戏前用：等不到结果就用上一次的，不拖住启动 */
export function checkResourceUpdatesQuickly(
  instancePath: string
): Promise<ResourceUpdate[]> {
  return Promise.race([
    checkResourceUpdates(instancePath),
    new Promise<ResourceUpdate[]>(resolve => {
      setTimeout(
        () =>
          resolve(selectUpdates(useResourceUpdatesStore.getState().resources)),
        LAUNCH_CHECK_TIMEOUT_MS
      );
    })
  ]);
}

/** 用户还没说过「稍后」的更新：弹窗只提示这些，页面上的更新按钮不受影响 */
export function unseenUpdates(updates: ResourceUpdate[]): ResourceUpdate[] {
  const seen = usePrefStore.getState().seenResourceUpdates ?? {};
  return updates.filter(u => seen[u.hub.package.id] !== u.hub.latest_version);
}

/** 记下这批新版已经提示过，同一版本不再弹窗 */
export function dismissResourceUpdates(updates: ResourceUpdate[]): void {
  usePrefStore.setState(s => ({
    seenResourceUpdates: {
      ...(s.seenResourceUpdates ?? {}),
      ...Object.fromEntries(
        updates.map(u => [u.hub.package.id, u.hub.latest_version])
      )
    }
  }));
}

/**
 * 新版装好之后收尾：安装器只会往 Maps / Mods 根目录放，这里把文件挪回旧文件所在的
 * 文件夹，删掉改了名的旧文件，并保持原来的禁用状态。
 */
async function settleInstalled(
  oldFiles: ResourceUpdate[],
  installedPaths: string[]
): Promise<void> {
  if (!installedPaths.length) return;
  const dir = await dirname(oldFiles[0].path);
  const names = await Promise.all(installedPaths.map(p => basename(p)));
  const finalPaths = await Promise.all(names.map(name => join(dir, name)));

  for (const [i, path] of installedPaths.entries()) {
    if (resourceKey(path) !== resourceKey(finalPaths[i]))
      await backend.rename(path, finalPaths[i]);
  }
  const kept = new Set(finalPaths.map(resourceKey));
  for (const file of oldFiles) {
    if (!kept.has(resourceKey(file.path))) await backend.delete(file.path);
  }
  if (oldFiles.every(f => f.path.toLowerCase().endsWith(".disable"))) {
    for (const name of names) await backend.disable(dir, name);
  }
}

/** 新版新增的依赖才要装：已经有的不动，地图 / mod 以外的类别这里也认不出装没装，交给用户 */
function needsDependency(
  task: { url: string; category?: string },
  resources: TrackedResource[]
): boolean {
  if (!["map", "mod", "bmod", "bmodp"].includes(task.category ?? ""))
    return false;
  const id = packageIdFromUrl(task.url);
  return !resources.some(r => r.hub?.package.id === id);
}

/** 更新同一资源、同一文件夹下的一组文件。返回 false = 用户取消了，后面的也别装了 */
async function updateGroup(group: ResourceUpdate[]): Promise<boolean> {
  const { id, name } = group[0].hub.package;
  await hubReady();
  const queue = await buildImportQueue(hubUrl(`/packages/${id}/download`));
  const resources = Object.values(useResourceUpdatesStore.getState().resources);

  for (const task of queue) {
    if (task.isDependency && !needsDependency(task, resources)) continue;
    const outcome = await importFromUrl(task.url, undefined, {
      title: task.isDependency ? task.name : (name ?? task.name),
      isDependency: task.isDependency,
      onInstalled: task.isDependency
        ? undefined
        : result => settleInstalled(group, result.installedPaths)
    });
    if (outcome === "cancelled") return false;
  }
  return true;
}

/** 把这些文件更新到下载站的最新版。游戏开着时文件被占用，不让更新 */
export async function updateResources(
  updates: ResourceUpdate[]
): Promise<void> {
  const app = useAppStore.getState();
  const instancePath = app.selectedInstanceData?.path;
  if (!instancePath || !updates.length) return;
  if (app.runningInstancePid) {
    message.warning(t("resources.update.gameRunning"));
    return;
  }
  if (useResourceUpdatesStore.getState().updating) return;

  // 没装加载器时一个 mod 两份产物都在，它们是同一次安装；放在不同文件夹的地图各走各的
  const groups = new Map<string, ResourceUpdate[]>();
  for (const update of updates) {
    const key = `${update.hub.package.id}:${resourceKey(await dirname(update.path))}`;
    groups.set(key, [...(groups.get(key) ?? []), update]);
  }

  useResourceUpdatesStore.setState({ updating: true });
  try {
    for (const group of groups.values()) {
      if (!(await updateGroup(group))) break;
    }
  } catch (e) {
    message.error(
      t("brp.import.failed", {
        reason: e instanceof Error ? e.message : String(e)
      })
    );
  } finally {
    useResourceUpdatesStore.setState({ updating: false });
    void checkResourceUpdates(instancePath);
  }
}
