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
export const bvmFrameUrl = () => {
  const u = new URL(BVM_URL);
  u.searchParams.set("host", "rockoon");
  return u.toString();
};

type OpenRequest = { name: string; data: Uint8Array };

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
  post({ type: "open", name: pendingOpen.name, data: pendingOpen.data });
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
    pendingOpen: { name, data: bytes }
  });
  flushOpen();
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
      post({ type: "hello" });
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
