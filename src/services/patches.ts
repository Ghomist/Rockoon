import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";

import backend from "@/backend";
import { RESOURCE_HUB } from "@/services/game";
import { usePrefStore } from "@/stores/pref";
import { t } from "@/i18n";

/** 补丁 = 下载站上由后台从上游 GitHub 同步的资源（BML / BML+ / 新 Player）。 */

type PatchList = { items: PatchComponent[] };
type VersionList = { items: PatchVersion[] };

/** 拉取补丁清单（含安装提示：装到哪、要不要剥层、校验文件） */
export async function fetchPatches(): Promise<PatchComponent[]> {
  const res = await fetch(`${RESOURCE_HUB}/patches`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as PatchList;
  return data.items ?? [];
}

/** 拉取某个补丁的全部版本（回退时要选版本） */
export async function fetchPatchVersions(packageId: number): Promise<PatchVersion[]> {
  const res = await fetch(`${RESOURCE_HUB}/packages/${packageId}/versions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function downloadUrl(component: PatchComponent, fileVersion?: number | null): string {
  if (!component.package_id) throw new Error("该补丁还没有可下载的版本");
  return fileVersion
    ? `${RESOURCE_HUB}/packages/${component.package_id}/versions/${fileVersion}/download`
    : `${RESOURCE_HUB}/packages/${component.package_id}/download`;
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
          await listen<GameInstallComplete>("game-install:complete", async e => {
            cleanup();
            if (!e.payload.success) {
              reject(new Error(e.payload.error || t("game.failed")));
              return;
            }
            // 装完校验：确认文件真的落到该在的位置（上游包结构变了会在这里暴露）
            if (!(await backend.exists(await join(targetDir, component.marker)))) {
              reject(new Error(t("patches.markerMissing", { file: component.marker })));
              return;
            }
            // 记录装的是哪个版本，供更新检测与「已安装」展示使用
            const installed = target?.tag ?? component.latest;
            usePrefStore.setState(s => ({
              patchVersions: { ...(s.patchVersions ?? {}), [component.key]: installed }
            }));
            hooks.onPhase("done");
            hooks.onPercent(100);
            resolve();
          })
        ];

        const id = await backend.patches.install(url, targetDir, component.strip_top_level);
        hooks.onTaskId(id);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}

export type PatchUpdate = { component: PatchComponent; installed: string };

/**
 * 已安装的补丁有没有更新（没装过的补丁不打扰用户）。
 * 用户点过「稍后」的版本会被记下来，不再重复提示。
 */
export async function checkPatchUpdates(instancePath: string): Promise<PatchUpdate[]> {
  const components = await fetchPatches();
  const seen = usePrefStore.getState().seenPatchVersions ?? {};
  const out: PatchUpdate[] = [];

  for (const component of components) {
    if (!component.package_id || !component.latest) continue;
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
    seenPatchVersions: { ...(s.seenPatchVersions ?? {}), [component.key]: component.latest }
  }));
}
