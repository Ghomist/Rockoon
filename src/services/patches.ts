import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";

import backend from "@/backend";
import { hubFetch, hubUrl } from "@/services/hub";
import { usePrefStore } from "@/stores/pref";
import { t } from "@/i18n";

/** 补丁 = 下载站上由后台从上游 GitHub 同步的资源（BML / BML+ / 新 Player）。 */

type PatchList = { items: PatchComponent[] };
type VersionList = { items: PatchVersion[] };

/** 拉取补丁清单（含安装提示：装到哪、要不要剥层、校验文件） */
export async function fetchPatches(): Promise<PatchComponent[]> {
  const res = await hubFetch("/patches");
  const data = (await res.json()) as PatchList;
  return data.items ?? [];
}

/** 拉取某个补丁的全部版本（回退时要选版本） */
export async function fetchPatchVersions(
  packageId: number
): Promise<PatchVersion[]> {
  const res = await hubFetch(`/packages/${packageId}/versions`);
  const data = (await res.json()) as VersionList;
  return data.items ?? [];
}

/** 补丁的安装目录：游戏根，或游戏根下的 Bin */
export function patchTargetDir(
  component: PatchComponent,
  instancePath: string
): Promise<string> {
  return component.install_target === "bin"
    ? join(instancePath, "Bin")
    : Promise.resolve(instancePath);
}

function downloadUrl(
  component: PatchComponent,
  fileVersion?: number | null
): string {
  if (!component.package_id) throw new Error("该补丁还没有可下载的版本");
  return fileVersion
    ? hubUrl(`/packages/${component.package_id}/versions/${fileVersion}/download`)
    : hubUrl(`/packages/${component.package_id}/download`);
}

/**
 * 要装哪个版本：传 null 就是装最新版；传 { version, tag } 就是指定版本（回退）。
 * `version` 是文件序号（下载用），`tag` 是上游版本号（记下来与最新版对比用）。
 */
export type PatchInstallTarget = { version: number; tag: string } | null;

/** Rockoon 记录的已安装版本（手动装的补丁没有记录） */
export function installedVersion(key: string): string | undefined {
  return usePrefStore.getState().patchVersions?.[key] || undefined;
}

/**
 * 这个游戏里装了没装某个补丁？
 * - null：没装（校验文件不在）
 * - ""：装了，但版本未知（不是 Rockoon 装的）
 * - 其他：Rockoon 装的版本号
 */
export async function detectInstalled(
  component: PatchComponent,
  instancePath: string
): Promise<string | null> {
  // 新 Player：两种构建产出的文件一样，磁盘上只有「装了 / 没装」两种状态
  if (isPlayerPatch(component.key)) {
    if (!(await detectPlayer(instancePath))) return null;
    return installedPlayerVersion() ?? "";
  }
  const dir = await patchTargetDir(component, instancePath);
  if (!(await backend.exists(await join(dir, component.marker)))) return null;
  return installedVersion(component.key) ?? "";
}

/**
 * 安装 / 更新 / 回退到指定版本（version 为空表示装最新版）。
 * 进度复用原版游戏安装的事件通道，取消走 backend.cancelInstall。
 */
export async function installPatch(
  component: PatchComponent,
  instancePath: string,
  target: PatchInstallTarget,
  hooks: PatchInstallProgress
): Promise<void> {
  const targetDir = await patchTargetDir(component, instancePath);
  const url = downloadUrl(component, target?.version ?? null);

  // 自己之前被互斥关系禁用过（BML.dll.disable）就先恢复回来，
  // 否则重装完会同时留着 BML.dll 和 BML.dll.disable 两份文件。
  const own = PATCH_MUTEX[component.key]?.disable;
  if (own) {
    try {
      const dir = await join(instancePath, own.dir);
      const disabled = `${own.file}.disable`;
      if (await backend.exists(await join(dir, disabled))) {
        await backend.enable(dir, disabled);
      }
    } catch (e) {
      console.warn("Restore own disabled file failed:", e);
    }
  }

  return new Promise<void>((resolve, reject) => {
    let unlisten: (() => void)[] = [];

    const cleanup = () => {
      unlisten.forEach(fn => fn());
      unlisten = [];
    };

    void (async () => {
      try {
        unlisten = [
          await listen<GameInstallProgress>("game-install:progress", e => {
            hooks.onPhase(e.payload.phase);
            hooks.onPercent(e.payload.percent);
          }),
          await listen<GameInstallComplete>(
            "game-install:complete",
            async e => {
              cleanup();
              if (!e.payload.success) {
                reject(new Error(e.payload.error || t("game.failed")));
                return;
              }
              // 装完校验：确认文件真的落到该在的位置（上游包结构变了会在这里暴露）
              if (
                !(await backend.exists(await join(targetDir, component.marker)))
              ) {
                reject(
                  new Error(
                    t("patches.markerMissing", { file: component.marker })
                  )
                );
                return;
              }
              // 记录装的是哪个版本，供更新检测与「已安装」展示使用
              const installed = target?.tag ?? component.latest;
              usePrefStore.setState(s => {
                const merged = {
                  ...(s.patchVersions ?? {}),
                  [component.key]: installed
                };
                // 两种 Player 构建产出的文件一样，只保留刚装的那个记录
                const next = isPlayerPatch(component.key)
                  ? Object.fromEntries(
                      Object.entries(merged).filter(
                        ([key]) => !isPlayerPatch(key) || key === component.key
                      )
                    )
                  : merged;
                return { patchVersions: next };
              });
              hooks.onPhase("done");
              hooks.onPercent(100);
              resolve();
            }
          )
        ];

        const id = await backend.patches.install(
          url,
          targetDir,
          component.strip_top_level
        );
        hooks.onTaskId(id);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}

/**
 * 互斥表：同一组里只能有一个补丁生效。
 *
 * - `modloader`（BML / BML+）：两个加载器各往 BuildingBlocks/ 放自己的 DLL，
 *   同时存在会互相抢注入 —— 用哪个是玩家的自由，所以装一个就把另一个**禁用**
 *   （改名成 .disable，文件还在，随时能装回来）。
 * - Player 的两种构建（vc6 / msvc2022）**不在表里**：它们产出的文件完全一样，
 *   磁盘上分不出装的是哪个，所以启动器把它们当成同一个「新 Player」处理（只能二选一）。
 */
export const PATCH_MUTEX: Record<
  string,
  {
    group: "modloader";
    conflicts: string[];
    disable?: { dir: string; file: string };
  }
> = {
  bml: {
    group: "modloader",
    conflicts: ["bmlplus"],
    disable: { dir: "BuildingBlocks", file: "BML.dll" }
  },
  bmlplus: {
    group: "modloader",
    conflicts: ["bml"],
    disable: { dir: "BuildingBlocks", file: "BMLPlus.dll" }
  }
};

/** 这个补丁属于哪一组互斥（不在表里的就不是互斥补丁） */
export function mutexGroupOf(key: string): "modloader" | undefined {
  return PATCH_MUTEX[key]?.group;
}

/** 「新 Player」的两种构建：同一个补丁，同时只可能有一个 */
export const PLAYER_KEYS = ["player-vc6", "player-msvc2022"] as const;
/** 默认装哪个构建（用户可在版本列表里选另一种） */
export const DEFAULT_PLAYER_KEY = "player-vc6";

/** 下载站上的这两个组件其实是同一个东西（新 Player） */
export function isPlayerPatch(key: string): boolean {
  return (PLAYER_KEYS as readonly string[]).includes(key);
}

/** 玩家看到的列表里，两种构建只展示主构建那一项 */
export function isSecondaryPlayer(key: string): boolean {
  return isPlayerPatch(key) && key !== DEFAULT_PLAYER_KEY;
}

/** 原版 Ballance 的 Player.exe 大小；存在且不等于它 = 装了新 Player */
const VANILLA_PLAYER_SIZE = 155648;

/**
 * 新 Player 装了没装。
 *
 * 不看安装标记（两种构建的 marker 都是 Bin/Player.exe，没区分度），而是直接看
 * 文件在不在、大小是不是原版那份 —— 和启动器选实例时的判定一致。
 * 注意：手动丢进去的 Player.exe 也会被认成装了（故意如此，对玩家更直观）。
 */
export async function detectPlayer(instancePath: string): Promise<boolean> {
  try {
    const exe = await join(instancePath, "Bin", "Player.exe");
    if (!(await backend.exists(exe))) return false;
    return (await backend.size(exe)) !== VANILLA_PLAYER_SIZE;
  } catch {
    return false;
  }
}

/** 已装的新 Player 是哪种构建（两边都有记录 = 分不清，下次装一次就自愈） */
export function installedPlayerBuild():
  | (typeof PLAYER_KEYS)[number]
  | undefined {
  const versions = usePrefStore.getState().patchVersions ?? {};
  const hits = PLAYER_KEYS.filter(key => versions[key]);
  return hits.length === 1 ? hits[0] : undefined;
}

/** 新 Player 记录里的版本号（不管当时装的是哪种构建） */
export function installedPlayerVersion(): string | undefined {
  const versions = usePrefStore.getState().patchVersions ?? {};
  return (
    versions[DEFAULT_PLAYER_KEY] ?? versions["player-msvc2022"] ?? undefined
  );
}

/** 找出与它互斥、且当前确实装着的补丁（装之前要先处理掉这些） */
export async function findConflicts(
  component: PatchComponent,
  instancePath: string,
  all: PatchComponent[]
): Promise<PatchComponent[]> {
  const entry = PATCH_MUTEX[component.key];
  if (!entry) return [];

  const found: PatchComponent[] = [];
  for (const key of entry.conflicts) {
    const other = all.find(c => c.key === key);
    if (!other) continue;
    if ((await detectInstalled(other, instancePath)) !== null)
      found.push(other);
  }
  return found;
}

/** 禁用冲突补丁（可逆）+ 清掉它的版本记录，返回实际处理掉的组件 */
export async function resolveConflicts(
  instancePath: string,
  conflicts: PatchComponent[]
): Promise<PatchComponent[]> {
  const handled: PatchComponent[] = [];

  for (const other of conflicts) {
    const entry = PATCH_MUTEX[other.key];
    const disable = entry?.disable;
    if (disable) {
      const dir = await join(instancePath, disable.dir);
      if (await backend.exists(await join(dir, disable.file))) {
        await backend.disable(dir, disable.file);
      }
    }
    // 记录里也要清掉，否则下次检测还会认为它装着
    usePrefStore.setState(s => ({
      patchVersions: Object.fromEntries(
        Object.entries(s.patchVersions ?? {}).filter(
          ([key]) => key !== other.key
        )
      )
    }));
    handled.push(other);
  }

  return handled;
}

export type PatchUpdate = { component: PatchComponent; installed: string };

/**
 * 已安装的补丁有没有更新（没装过的补丁不打扰用户）。
 * 用户点过「稍后」的版本会被记下来，不再重复提示。
 */
export async function checkPatchUpdates(
  instancePath: string
): Promise<PatchUpdate[]> {
  const components = await fetchPatches();
  const seen = usePrefStore.getState().seenPatchVersions ?? {};
  const out: PatchUpdate[] = [];

  for (const component of components) {
    if (!component.package_id || !component.latest) continue;
    // 两种 Player 构建是同一个补丁，只按主构建提示一次
    if (isSecondaryPlayer(component.key)) continue;
    const installed = await detectInstalled(component, instancePath);
    if (installed === null) continue; // 没装过 → 不提示
    if (installed === component.latest) continue; // 已是最新
    if (seen[component.key] === component.latest) continue; // 这个版本提示过并被忽略了
    out.push({ component, installed });
  }
  return out;
}

/** 记下「这个版本我不更新了」，下次不再弹 */
export function dismissPatchUpdate(component: PatchComponent): void {
  usePrefStore.setState(s => ({
    seenPatchVersions: {
      ...(s.seenPatchVersions ?? {}),
      [component.key]: component.latest
    }
  }));
}
