/**
 * TAS 编辑器自己的偏好（网格开关、每帧宽度、轨道顺序）。
 *
 * 为什么不用 `usePrefStore`：主窗口和 TAS 窗口是两个 webview，共用 localStorage。
 * pref store 是「整份覆盖式」持久化（`initStores` 里防抖写整个 state），
 * 两个窗口一起写会把对方的改动抹掉。所以这里单开一个键，只读写自己的这几项。
 */

import { DEFAULT_TRACK_ORDER, KEY_BITS, type TasKey } from "./format";
import { DEFAULT_CELL_W, clampCellW } from "./viewport";
import storage from "@/utils/storage";

const PREFS_KEY = "rockoon-tas-editor";

export type TasEditorPrefs = {
  /** 纵向网格线（大区交替底色也跟它一起开关）。 */
  vGrid: boolean;
  /** 横向网格线。 */
  hGrid: boolean;
  /** 每帧像素宽（0 表示还没缩放，按默认值）。 */
  cellW: number;
  /** 轨道从上到下的顺序。 */
  trackOrder: TasKey[];
  /** 锁定的轨道（完全不可编辑）。 */
  locked: TasKey[];
};

export const DEFAULT_TAS_PREFS: TasEditorPrefs = {
  vGrid: true,
  hGrid: true,
  cellW: DEFAULT_CELL_W,
  trackOrder: [...DEFAULT_TRACK_ORDER],
  locked: []
};

/** 轨道顺序来自 localStorage，可能被手改坏：必须是 9 个键各一次，否则回退默认。 */
function sanitizeOrder(value: unknown): TasKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_TRACK_ORDER];
  const all = new Set<string>(KEY_BITS);
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !all.has(item) || seen.has(item)) {
      return [...DEFAULT_TRACK_ORDER];
    }
    seen.add(item);
  }
  return seen.size === all.size ? (value as TasKey[]) : [...DEFAULT_TRACK_ORDER];
}

/** 锁定轨道来自 localStorage，可能被手改坏：只保留合法的键名并去重（锁不住全部轨道也行）。 */
function sanitizeLocked(value: unknown): TasKey[] {
  if (!Array.isArray(value)) return [];
  const all = new Set<string>(KEY_BITS);
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && all.has(item)) seen.add(item);
  }
  return [...seen] as TasKey[];
}

export function loadTasPrefs(): TasEditorPrefs {
  const raw = storage.getWithDefault<Partial<TasEditorPrefs>>(PREFS_KEY, {});
  return {
    vGrid: raw.vGrid ?? DEFAULT_TAS_PREFS.vGrid,
    hGrid: raw.hGrid ?? DEFAULT_TAS_PREFS.hGrid,
    cellW: raw.cellW ? clampCellW(raw.cellW) : DEFAULT_TAS_PREFS.cellW,
    trackOrder: sanitizeOrder(raw.trackOrder),
    locked: sanitizeLocked(raw.locked)
  };
}

export function saveTasPrefs(prefs: TasEditorPrefs): void {
  storage.set(PREFS_KEY, prefs);
}
