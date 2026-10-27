import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { create } from "zustand";
import backend from "@/backend";
import { t } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { useDownloadsStore } from "@/stores/downloads";
import { usePrefStore } from "@/stores/pref";
import { message } from "@/utils/ui/feedback";
import { isMac } from "@/utils/platform";
import { hubFetch, hubUrl } from "@/services/hub";

/**
 * 制图工具：Blender + BBP（Ballance Blender Plugin）。后端见 src-tauri/src/commands/blender.rs。
 *
 * - Blender 不代装，只检测本机已装的（也可以手选），给出官网下载链接；
 * - BBP 一键安装：下载站存档的版本（上游已归档，见 ballance-resource-hub/docs/patches.md），
 *   下载站不通再回落 GitHub 最新 release → 解压到 Blender 的 extensions/user_default/bbp_ng
 *   （复用补丁安装的下载/解压流水线，进度在「下载任务」里）→ 启用并把材质目录设成当前游戏的 Textures；
 * - 一键编辑：打开 Blender，清空默认场景，用 BBP 导入地图。
 */

export const BLENDER_DOWNLOAD_URL = "https://www.blender.org/download/lts/";
export const BBP_REPO_URL = "https://github.com/yyc12345/BallanceBlenderHelper";
export const BBP_MANUAL_URL =
  "https://ghomist.github.io/ballance-mapping-manual/mapping/intro/installations.html";
/** 4.0+ 的 BBP 是扩展，装在 user_default 仓库里就是这个模块名 */
export const BBP_MODULE = "bl_ext.user_default.bbp_ng";

const TASK_KEY = "bbp:install";
let taskSeq = 0;

interface MappingState {
  /** 自动找到的 Blender */
  candidates: string[];
  /** 正在用的 Blender（用户手选的优先） */
  blender: string | null;
  probe: BlenderProbe | null;
  probing: boolean;
  error: string | null;
  /** 重新检测 Blender 与 BBP 状态 */
  refresh: () => Promise<void>;
  /** 用指定的 Blender（传 null 恢复自动检测） */
  select: (path: string | null) => Promise<void>;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 下载站上 BBP 的存档（按 source_key 找，不写死资源 id） */
async function hubBbpRelease(): Promise<BbpRelease> {
  const key = isMac ? "bbp-macos" : "bbp-windows";
  const list = await (
    await hubFetch("/packages?category=x-patch&limit=100")
  ).json();
  const pkg = (list.items as { id: number; source_key?: string }[]).find(
    p => p.source_key === key
  );
  if (!pkg) throw new Error(`download site has no ${key}`);
  const versions = await (
    await hubFetch(`/packages/${pkg.id}/versions`)
  ).json();
  const cur = (
    versions.items as {
      version: number;
      note: string;
      file_name: string;
      file_size: number;
      is_current: boolean;
    }[]
  ).find(v => v.is_current);
  if (!cur) throw new Error(`${key} has no versions`);
  return {
    tag: cur.note,
    assetName: cur.file_name,
    // 下载地址用文件序号，不是 tag（见 AGENTS.md「版本号有两套」）
    url: hubUrl(`/packages/${pkg.id}/versions/${cur.version}/download`),
    size: cur.file_size
  };
}

/** BBP 最新版：优先下载站，失败再问 GitHub */
export async function latestBbpRelease(): Promise<BbpRelease> {
  try {
    return await hubBbpRelease();
  } catch (e) {
    console.warn("BBP from download site failed, falling back to GitHub:", e);
    return backend.blender.bbpLatestRelease();
  }
}

export const useMappingStore = create<MappingState>((set, get) => ({
  candidates: [],
  blender: null,
  probe: null,
  probing: false,
  error: null,
  refresh: async () => {
    set({ probing: true, error: null });
    try {
      const candidates = await backend.blender.find();
      const saved = usePrefStore.getState().blenderPath;
      const blender =
        saved && (await backend.exists(saved))
          ? saved
          : (candidates[0] ?? null);
      set({ candidates, blender, probe: null });
      if (blender) set({ probe: await backend.blender.probe(blender) });
    } catch (e) {
      set({ error: errText(e) });
    } finally {
      set({ probing: false });
    }
  },
  select: async path => {
    usePrefStore.setState({ blenderPath: path ?? undefined });
    usePrefStore.getState().save();
    await get().refresh();
  }
}));

/** 新版 BBP（扩展）；没装返回 undefined */
export const bbpOf = (probe: BlenderProbe | null) =>
  probe?.bbp.find(m => m.module === BBP_MODULE);

/** 其他位置的 BBP（旧版插件、或装在 addons 里的 bbp_ng）：会和新版冲突，要用户手动删 */
export const legacyBbpOf = (probe: BlenderProbe | null) =>
  probe?.bbp.filter(m => m.module !== BBP_MODULE) ?? [];

/** 当前游戏的 Textures 目录（BBP 从这里取外置贴图）；没选游戏返回空串 */
export async function gameTexturesDir(): Promise<string> {
  const path = useAppStore.getState().selectedInstanceData?.path;
  return path ? join(path, "Textures") : "";
}

/**
 * 跑一次 start_patch_install 并跟踪 game-install:* 事件直到结束。
 * 后端 id 要等 invoke 返回才知道，之前到的完成事件先存着，免得快速失败时漏掉。
 */
async function runInstall(
  taskId: string,
  start: () => Promise<string>
): Promise<void> {
  const downloads = () => useDownloadsStore.getState();
  let id = taskId;
  const early = new Map<string, GameInstallComplete>();
  let done: (r: GameInstallComplete) => void = () => {};
  const finished = new Promise<GameInstallComplete>(r => (done = r));
  const unlisten = await Promise.all([
    listen<GameInstallProgress>("game-install:progress", e => {
      if (e.payload.id !== id) return;
      downloads().progress(id, e.payload.downloaded, e.payload.total);
      if (e.payload.phase !== "done")
        downloads().update(id, { phase: e.payload.phase });
    }),
    listen<GameInstallComplete>("game-install:complete", e => {
      if (e.payload.id === id) done(e.payload);
      else early.set(e.payload.id, e.payload);
    })
  ]);
  try {
    const backendId = await start();
    downloads().update(id, { id: backendId });
    id = backendId;
    const hit = early.get(id);
    if (hit) done(hit);
    const result = await finished;
    if (!result.success) throw new Error(result.error || t("game.failed"));
  } finally {
    unlisten.forEach(fn => fn());
  }
}

/**
 * 一键安装 / 更新 BBP（登记成下载任务）。装好返回 true。
 * 覆盖安装前会删掉旧的 bbp_ng 目录 —— Blender 开着时 BMap.dll 被占用删不掉，会提示先关 Blender。
 */
export async function installBbpAsTask(): Promise<boolean> {
  const { blender, probe } = useMappingStore.getState();
  if (!blender || !probe) return false;
  if (!probe.extensionsDir) {
    message.error(t("mapping.bbp.blenderTooOld"));
    return false;
  }

  let release: BbpRelease;
  try {
    release = await latestBbpRelease();
  } catch (e) {
    message.error(t("mapping.bbp.releaseFailed", { reason: errText(e) }));
    return false;
  }

  const { task, duplicate } = useDownloadsStore.getState().begin({
    id: `bbp-${++taskSeq}`,
    key: TASK_KEY,
    kind: "patch",
    title: `Ballance Blender Plugin ${release.tag}`,
    target: blender,
    total: release.size,
    cancellable: true,
    retry: () => void installBbpAsTask()
  });
  if (duplicate) return false;

  const downloads = () => useDownloadsStore.getState();
  const dir = await join(probe.extensionsDir, "bbp_ng");
  try {
    try {
      if (await backend.exists(dir)) await backend.remove_dir(dir);
    } catch (e) {
      throw new Error(t("mapping.bbp.closeBlender", { reason: errText(e) }));
    }
    await runInstall(task.id, () =>
      backend.patches.install(release.url, dir, false)
    );
    // 任务 id 已经换成后端 id 了，按 key 找回来
    const id = downloads().findByKey(TASK_KEY)?.id ?? task.id;
    await backend.blender.configureBbp(blender, await gameTexturesDir());
    downloads().succeed(id);
    message.success(t("mapping.bbp.installed", { version: release.tag }));
    void useMappingStore.getState().refresh();
    return true;
  } catch (e) {
    const id = downloads().findByKey(TASK_KEY)?.id ?? task.id;
    const status = downloads().tasks.find(x => x.id === id)?.status;
    if (status === "cancelled") return false;
    if (status === "running") downloads().fail(id, errText(e));
    message.error(t("mapping.bbp.installFailed", { reason: errText(e) }));
    return false;
  }
}

/** 重新启用 BBP 并把材质目录指向当前游戏 */
export async function configureBbp(): Promise<void> {
  const { blender } = useMappingStore.getState();
  if (!blender) return;
  const textures = await gameTexturesDir();
  if (!textures) {
    message.warning(t("mapping.noInstance"));
    return;
  }
  try {
    await backend.blender.configureBbp(blender, textures);
    message.success(t("mapping.bbp.configured"));
    await useMappingStore.getState().refresh();
  } catch (e) {
    message.error(t("mapping.bbp.configureFailed", { reason: errText(e) }));
  }
}

/** 一键编辑：用 Blender 打开地图（BBP 导入）。缺 Blender / BBP 时提示去制图工具页 */
export async function editMapInBlender(mapPath: string): Promise<void> {
  const store = useMappingStore.getState();
  if (!store.probe && !store.probing) await store.refresh();
  const { blender, probe } = useMappingStore.getState();
  if (!blender) {
    message.warning(t("mapping.edit.noBlender"));
    return;
  }
  if (!bbpOf(probe)) {
    message.warning(t("mapping.edit.noBbp"));
    return;
  }
  try {
    await backend.blender.openMap(blender, mapPath, await gameTexturesDir());
    message.success(t("mapping.edit.opening"));
  } catch (e) {
    message.error(t("mapping.edit.failed", { reason: errText(e) }));
  }
}
