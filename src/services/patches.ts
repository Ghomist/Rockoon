import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";

import backend from "@/backend";
import { hubFetch, hubUrl } from "@/services/hub";
import { useDownloadsStore } from "@/stores/downloads";
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

/**
 * 兼容旧安装的版本记录。
 * 早期版本把补丁版本写在启动器配置里，且 key 只有补丁名没有游戏目录，
 * 多个游戏目录会互相串；现在改用游戏目录里的记录文件，这个只读不写。
 */
export function installedVersion(key: string): string | undefined {
  return usePrefStore.getState().patchVersions?.[key] || undefined;
}

/** 记录文件的目录 / 文件名（固定在游戏根目录下，与补丁装到哪无关） */
const PATCH_RECORD_DIR = "ModLoader";
const PATCH_RECORD_FILE = ".rockoon-patch.json";

type PatchRecordEntry = { tag: string; at: string };
type PatchRecord = Record<string, PatchRecordEntry>;

async function patchRecordDir(instancePath: string): Promise<string> {
  return join(instancePath, PATCH_RECORD_DIR);
}

/**
 * 读游戏目录里的补丁记录。
 * 读不到 / 解析不了都当成空记录 —— 它只用来展示版本号，坏了不该拦住任何操作。
 */
/**
 * 最近一次读到的记录（按游戏目录缓存）。
 * 记录文件是异步读的，而 Player 的「构建/版本」两个 getter 是同步的（UI 里直接调用），
 * 所以 detectInstalled 读完之后这里留一份供它们同步取用。
 */
let recordCache: { instancePath: string; record: PatchRecord } | null = null;

async function readPatchRecord(instancePath: string): Promise<PatchRecord> {
  try {
    const path = await join(await patchRecordDir(instancePath), PATCH_RECORD_FILE);
    if (!(await backend.exists(path))) {
      recordCache = { instancePath, record: {} };
      return {};
    }
    const parsed: unknown = JSON.parse(await backend.readTextFile(path));
    const record = parsed && typeof parsed === "object" ? (parsed as PatchRecord) : {};
    recordCache = { instancePath, record };
    return record;
  } catch (e) {
    console.warn("Read patch record failed:", e);
    recordCache = { instancePath, record: {} };
    return {};
  }
}

/**
 * 往游戏目录的记录文件里写一条已安装版本（合并已有内容）。
 * 写失败只记日志：绝不能因为记不上版本而让安装失败。
 */
async function writePatchRecord(
  instancePath: string,
  key: string,
  tag: string
): Promise<void> {
  try {
    const dir = await patchRecordDir(instancePath);
    await backend.mkdir(dir);
    const record = await readPatchRecord(instancePath);
    record[key] = { tag, at: new Date().toISOString() };
    await backend.writeTextFile(
      await join(dir, PATCH_RECORD_FILE),
      JSON.stringify(record, null, 2)
    );
  } catch (e) {
    console.warn("Write patch record failed:", e);
  }
}

/** 删掉记录里的某个条目（互斥补丁被禁用后调用），失败同样只记日志 */
async function removePatchRecordEntry(
  instancePath: string,
  key: string
): Promise<void> {
  try {
    const record = await readPatchRecord(instancePath);
    if (!(key in record)) return;
    delete record[key];
    await backend.writeTextFile(
      await join(await patchRecordDir(instancePath), PATCH_RECORD_FILE),
      JSON.stringify(record, null, 2)
    );
  } catch (e) {
    console.warn("Remove patch record entry failed:", e);
  }
}

/**
 * 这个游戏里装了没装某个补丁？
 * - null：没装（校验文件不在）
 * - ""：装了，但版本未知（不是 Rockoon 装的，或下载站标注不跟踪版本）
 * - 其他：Rockoon 装的版本号（优先读游戏目录里的记录，老配置只作兼容）
 */
export async function detectInstalled(
  component: PatchComponent,
  instancePath: string
): Promise<string | null> {
  // 新 Player：两种构建产出的文件一样，磁盘上只有「装了 / 没装」两种状态
  if (isPlayerPatch(component.key)) {
    if (!(await detectPlayer(instancePath))) return null;
    // 两种构建的本质是同一个补丁：记录里哪个 player key 有值都算数
    const record = await readPatchRecord(instancePath);
    const tag = PLAYER_KEYS.map(key => record[key]?.tag).find(value => Boolean(value));
    return tag ?? installedPlayerVersion() ?? "";
  }
  const dir = await patchTargetDir(component, instancePath);
  if (!(await backend.exists(await join(dir, component.marker)))) return null;
  // 版本读不出来的补丁只回答装了没装，避免展示一个跨游戏目录串来的假版本号
  if (component.track_version === false) return "";
  const record = await readPatchRecord(instancePath);
  return record[component.key]?.tag ?? installedVersion(component.key) ?? "";
}

/**
 * 安装 / 更新 / 回退到指定版本（version 为空表示装最新版）。
 * 进度写进「下载任务」（`taskId` 是调用方用 begin 登记的占位任务 id，拿到后端 id 后替换），
 * 结束/失败也由这里落到任务上；取消走 stores/downloads 的 cancel → backend.cancelInstall。
 */
export async function installPatch(
  component: PatchComponent,
  instancePath: string,
  target: PatchInstallTarget,
  taskId: string
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
    // 后端 id 要等 install 返回才拿到：先拿占位 id 用着，拿到后连任务一起换过来
    let id = taskId;
    const downloads = () => useDownloadsStore.getState();
    const failWith = (reason: string): Error => {
      downloads().fail(id, reason);
      return new Error(reason);
    };

    const cleanup = () => {
      unlisten.forEach(fn => fn());
      unlisten = [];
    };

    void (async () => {
      try {
        unlisten = [
          await listen<GameInstallProgress>("game-install:progress", e => {
            if (e.payload.id !== id) return;
            downloads().progress(id, e.payload.downloaded, e.payload.total);
            if (e.payload.phase !== "done")
              downloads().update(id, { phase: e.payload.phase });
          }),
          await listen<GameInstallComplete>(
            "game-install:complete",
            async e => {
              if (e.payload.id !== id) return;
              cleanup();
              if (!e.payload.success) {
                reject(failWith(e.payload.error || t("game.failed")));
                return;
              }
              // 装完校验：确认文件真的落到该在的位置（上游包结构变了会在这里暴露）
              if (
                !(await backend.exists(await join(targetDir, component.marker)))
              ) {
                reject(
                  failWith(
                    t("patches.markerMissing", { file: component.marker })
                  )
                );
                return;
              }
              // 记录装的是哪个版本，供更新检测与「已安装」展示使用
              const installed = target?.tag ?? component.latest;
              if (isPlayerPatch(component.key)) {
                // 两种 Player 构建产出的文件一样，记录里只保留刚装的那个 key
                await writePatchRecord(instancePath, component.key, installed);
                for (const key of PLAYER_KEYS) {
                  if (key !== component.key) {
                    await removePatchRecordEntry(instancePath, key);
                  }
                }
              } else {
                // 版本记录进游戏目录（key 带游戏目录，多个实例才不会互相串），
                // 写失败只记日志，不影响安装结果
                await writePatchRecord(instancePath, component.key, installed);
              }
              downloads().succeed(id);
              resolve();
            }
          )
        ];

        const backendId = await backend.patches.install(
          url,
          targetDir,
          component.strip_top_level
        );
        // 任务 id 换成后端的，取消才能真的中断这次下载
        downloads().update(id, { id: backendId });
        id = backendId;
      } catch (e) {
        cleanup();
        reject(failWith(e instanceof Error ? e.message : String(e)));
      }
    })();
  });
}

/** 占位任务 id：后端 id 要等 install 返回才拿到，先拿它登记任务（拿到后 update 替换） */
let taskSeq = 0;

/**
 * 把一次补丁安装登记成「下载任务」并跑完它。
 * 同一个补丁、同一个版本、同一个目标目录只允许有一个任务在跑：重复调用会直接返回
 * false（不会重复下载）。装好返回 true，失败抛出异常（任务已被标成失败）。
 */
export async function installPatchAsTask(
  component: PatchComponent,
  instancePath: string,
  target: PatchInstallTarget
): Promise<boolean> {
  const key = `patch:${component.key}:${
    target?.version ?? component.latest ?? "latest"
  }:${instancePath}`;
  const { task, duplicate } = useDownloadsStore.getState().begin({
    id: `patch-${++taskSeq}`,
    key,
    kind: "patch",
    title: component.name,
    target: instancePath,
    cancellable: true,
    retry: () => void installPatchAsTask(component, instancePath, target)
  });
  if (duplicate) return false;
  await installPatch(component, instancePath, target, task.id);
  return true;
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

/** Player 在记录文件里的版本（记录文件异步读，这里只读缓存） */
function playerRecordVersions(): Partial<Record<(typeof PLAYER_KEYS)[number], string>> {
  const record = recordCache?.record ?? {};
  return Object.fromEntries(
    PLAYER_KEYS.filter(key => record[key]?.tag).map(key => [key, record[key].tag])
  );
}

/** 已装的新 Player 是哪种构建（两边都有记录 = 分不清，下次装一次就自愈） */
export function installedPlayerBuild():
  | (typeof PLAYER_KEYS)[number]
  | undefined {
  const fromRecord = Object.keys(playerRecordVersions()) as (typeof PLAYER_KEYS)[number][];
  if (fromRecord.length === 1) return fromRecord[0];
  if (fromRecord.length > 1) return undefined;
  // 记录文件里没有（老版本装的）→ 退回老配置
  const versions = usePrefStore.getState().patchVersions ?? {};
  const hits = PLAYER_KEYS.filter(key => versions[key]);
  return hits.length === 1 ? hits[0] : undefined;
}

/** 新 Player 的版本号（不管当时装的是哪种构建） */
export function installedPlayerVersion(): string | undefined {
  const fromRecord = Object.values(playerRecordVersions()).find(value => Boolean(value));
  if (fromRecord) return fromRecord;
  // 记录文件里没有（老版本装的）→ 退回老配置
  const versions = usePrefStore.getState().patchVersions ?? {};
  return versions[DEFAULT_PLAYER_KEY] ?? versions["player-msvc2022"] ?? undefined;
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
    // 记录里也要清掉（老配置和游戏目录记录都要），否则下次检测还会认为它装着
    usePrefStore.setState(s => ({
      patchVersions: Object.fromEntries(
        Object.entries(s.patchVersions ?? {}).filter(
          ([key]) => key !== other.key
        )
      )
    }));
    await removePatchRecordEntry(instancePath, other.key);
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
    // 下载站标注不跟踪版本的补丁（BML）不可能判断是否落后，直接不提醒
    if (component.track_version === false) continue;
    const installed = await detectInstalled(component, instancePath);
    if (installed === null) continue; // 没装过 → 不提示
    if (installed === "") continue; // 装了但版本未知（手动解压）→ 不提示
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
