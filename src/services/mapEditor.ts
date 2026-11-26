import { create } from "zustand";
import { t } from "@/i18n";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { normalizeMapPath, playMap } from "@/services/deepLinkPlay";
import { dialog } from "@/utils/ui/feedback";

/**
 * 「在线制图器」：内嵌 Ballance Vibe Mapping（BVM，网页地图编辑器）。
 *
 * iframe 打开 `<BVM>?host=rockoon`，两边用 postMessage 说话（消息都带 `ns: "bvm-rockoon"`）：
 * - BVM → Rockoon：`ready`（页面起来了）、`save`（导出好的 .nmo + 导入模型的贴图，`play` = 接着启动）
 * - Rockoon → BVM：`hello`（应答 ready，BVM 之后才发 save）、`saved`（保存结果）、`open`（地图列表里点了「在制图器中编辑」）
 *
 * 文件都写进当前实例：地图进 ModLoader/Maps，贴图进 Textures（已有同名的不覆盖，别把原版贴图换掉）。
 */

export const MAP_EDITOR_ROUTE = "/map-editor";
const NS = "bvm-rockoon";

/** 正式版用 GitHub Pages 上的在线版；开发时可以用 VITE_BVM_URL 指到本地的 BVM（如 http://localhost:5173/） */
export const BVM_URL: string =
  (import.meta.env.VITE_BVM_URL as string | undefined) ||
  "https://ghomist.github.io/ballance-vibe-mapping/";
export const BVM_ORIGIN = new URL(BVM_URL).origin;
/** iframe 地址：theme 是挂上时 Rockoon 的明暗，BVM 第一帧就用它（之后切换走 theme 消息，不改地址免得重新加载） */
export const bvmFrameUrl = (theme: EditorTheme) => {
  const u = new URL(BVM_URL);
  u.searchParams.set("host", "rockoon");
  u.searchParams.set("theme", theme);
  return u.toString();
};

export type EditorTheme = "dark" | "light";
/** Rockoon 现在的明暗（<html> 上有没有 dark），内嵌的 BVM 跟着它，自己的主题开关藏起来 */
export const currentTheme = (): EditorTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
let lastTheme: EditorTheme | null = null;
/** 明暗变了就告诉 BVM */
export function syncEditorTheme() {
  const theme = currentTheme();
  if (theme === lastTheme) return;
  lastTheme = theme;
  if (useMapEditorStore.getState().ready) post({ type: "theme", theme });
}

/** 打开以后做什么：只打开、保存进地图目录、保存并试玩 */
export type BvmAction = "open" | "save" | "play";

type OpenRequest =
  /** 地图列表的「在制图器中编辑」：.nmo 文件 */
  | { kind: "file"; name: string; data: Uint8Array }
  /** 浏览器里的 BVM 通过 rockoon://bvm 深链交过来的地图码 */
  | { kind: "code"; code: string; name: string; id: string; action: BvmAction };

interface MapEditorState {
  /** 打开过这个页面：iframe 挂上以后一直留着（切走只是藏起来），编辑器状态不丢 */
  visited: boolean;
  /** BVM 已经说过 ready */
  ready: boolean;
  /** 等 BVM 起来再发过去的「打开这张图」 */
  pendingOpen: OpenRequest | null;
}

export const useMapEditorStore = create<MapEditorState>()(() => ({
  visited: false,
  ready: false,
  pendingOpen: null
}));

let frameWindow: Window | null = null;
/** MapEditorHost 挂上 / 换掉 iframe 时登记 */
export function setEditorFrame(w: Window | null) {
  frameWindow = w;
  if (!w) useMapEditorStore.setState({ ready: false });
}

function post(msg: Record<string, unknown>) {
  frameWindow?.postMessage({ ns: NS, ...msg }, BVM_ORIGIN);
}

function flushOpen() {
  const { ready, pendingOpen } = useMapEditorStore.getState();
  if (!ready || !pendingOpen) return;
  if (pendingOpen.kind === "file")
    post({ type: "open", name: pendingOpen.name, data: pendingOpen.data });
  else
    post({
      type: "open-code",
      code: pendingOpen.code,
      name: pendingOpen.name,
      id: pendingOpen.id,
      action: pendingOpen.action
    });
  useMapEditorStore.setState({ pendingOpen: null });
}

/**
 * 地图列表的「在制图器中编辑」：读出文件交给制图器（还没加载好就等它 ready）。
 * 调用方负责跳到 MAP_EDITOR_ROUTE。
 */
export async function openInMapEditor(path: string): Promise<void> {
  const bytes = Uint8Array.from(await backend.readFile(path));
  const name = path.split(/[\\/]/).pop() ?? "map.nmo";
  useMapEditorStore.setState({
    visited: true,
    pendingOpen: { kind: "file", name, data: bytes }
  });
  flushOpen();
}

/**
 * 深链 `rockoon://bvm?action=&name=&id=&code=`（或 `&clip=<校验码>`）：浏览器里的 BVM 把地图交过来。
 * 地图码小就直接在链接里；大地图放在剪贴板，链接里只带校验码，核对上了才用。
 * 交给内嵌的制图器打开，它再按 action 导出、保存（play 接着启动）。
 * 返回 true = 已经排进制图器，调用方切到 MAP_EDITOR_ROUTE。
 */
export async function openBvmLink(params: URLSearchParams): Promise<boolean> {
  const raw = params.get("action");
  const action: BvmAction = raw === "play" || raw === "save" ? raw : "open";
  let code = params.get("code");
  const clip = params.get("clip");
  if (!code && clip) {
    code = await backend.readClipboardMap(clip).catch(() => null);
    if (!code) {
      dialog.warning({
        title: t("mapEditor.clipTitle"),
        content: t("mapEditor.clipBody")
      });
      return false;
    }
  }
  if (!code || !/^[\w-]+$/.test(code)) {
    dialog.warning({
      title: t("mapEditor.clipTitle"),
      content: t("mapEditor.badLink")
    });
    return false;
  }
  useMapEditorStore.setState({
    visited: true,
    pendingOpen: {
      kind: "code",
      code,
      name: params.get("name") ?? "",
      id: params.get("id") ?? "",
      action
    }
  });
  flushOpen();
  return true;
}

/** 这次运行里由制图器写过的文件：再写就是同一张图的新版本，不用再问 */
const savedThisSession = new Set<string>();

function confirmOverwrite(name: string): Promise<boolean> {
  return new Promise(resolve => {
    dialog.warning({
      title: t("mapEditor.overwriteTitle"),
      content: t("mapEditor.overwriteBody", { name }),
      positiveText: t("mapEditor.overwrite"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

type SaveMessage = {
  id: number;
  file: string;
  data: Uint8Array;
  textures?: { name: string; data: Uint8Array }[];
  play?: boolean;
};

/** 写地图（和贴图），play 就接着启动。返回给 BVM 的结果 */
async function save(
  msg: SaveMessage
): Promise<{ ok: boolean; message?: string }> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) return { ok: false, message: t("mapEditor.noInstance") };
  // 只认一个文件名（不带目录），放在 Maps 根上
  const map = normalizeMapPath(msg.file);
  if (!map || map.includes("/") || !(msg.data instanceof Uint8Array))
    return { ok: false, message: t("mapEditor.badFile", { name: msg.file }) };
  const root = instance.path.replace(/[\\/]+$/, "");
  const abs = `${root}/ModLoader/Maps/${map}`;
  const key = abs.toLowerCase();
  if (!savedThisSession.has(key) && (await backend.exists(abs))) {
    if (!(await confirmOverwrite(map)))
      return {
        ok: false,
        message: t("mapEditor.notOverwritten", { name: map })
      };
  }
  await backend.writeFile(abs, Array.from(msg.data));
  savedThisSession.add(key);
  for (const tex of msg.textures ?? []) {
    if (!/^[^\\/:*?"<>|]+$/.test(tex.name) || tex.name.startsWith("."))
      continue;
    const texPath = `${root}/Textures/${tex.name}`;
    if (await backend.exists(texPath)) continue;
    await backend.writeFile(texPath, Array.from(tex.data));
  }
  if (msg.play && !(await playMap(map)))
    return { ok: false, message: t("mapEditor.saved", { name: map }) };
  return { ok: true };
}

/** 收 BVM 的消息。App 挂一次就行 */
export function listenMapEditor(): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== BVM_ORIGIN || !frameWindow || e.source !== frameWindow)
      return;
    const m = e.data as { ns?: string; type?: string } & Partial<SaveMessage>;
    if (m?.ns !== NS) return;
    if (m.type === "ready") {
      lastTheme = currentTheme();
      post({ type: "hello", theme: lastTheme });
      useMapEditorStore.setState({ ready: true });
      flushOpen();
    } else if (m.type === "save" && typeof m.id === "number") {
      const id = m.id;
      save(m as SaveMessage)
        .catch(err => ({
          ok: false,
          message: err instanceof Error ? err.message : String(err)
        }))
        .then(r => post({ type: "saved", id, ...r }));
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
