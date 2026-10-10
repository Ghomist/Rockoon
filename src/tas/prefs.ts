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

/** 回放速度倍率上限（再快就是 CPU 跑不动了，没意义）。 */
export const MAX_PLAY_SPEED = 64;
/** 速度滑条的档位（倍率，从慢到快）；最后一档 0 = 不限速。 */
export const PLAY_SPEED_STOPS = [
  0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 16, 0
];

export type TasEditorPrefs = {
  /** 纵向网格线。 */
  vGrid: boolean;
  /** 横向网格线。 */
  hGrid: boolean;
  /** 「分区」：主刻度区间的交替底色（独立于纵线开关）。 */
  bands: boolean;
  /** 每帧像素宽（0 表示还没缩放，按默认值）。 */
  cellW: number;
  /** 轨道从上到下的顺序。 */
  trackOrder: TasKey[];
  /** 锁定的轨道（完全不可编辑）。 */
  locked: TasKey[];
  /** 右上游戏区域的分辨率（启动游戏时用 `-w/-h` 定死，之后区域就按它的大小画）。 */
  gameWidth: number;
  gameHeight: number;
  /** 一键播放时每个项目进哪一关（项目名 → 1~13）；没记过就按文件名猜。 */
  projectLevels: Record<string, number>;
  /** 回放速度倍率（相对录像帧率）；0 = 不限速。播放中随时可改。 */
  playSpeed: number;
};

/** 常见的游戏窗口分辨率（4:3 为主；宽屏那几项需要游戏配置里打开 UnlockWidescreen）。 */
export const GAME_RESOLUTIONS: Array<[number, number]> = [
  [640, 480],
  [800, 600],
  [1024, 768],
  [1280, 960],
  [1600, 1200],
  [1280, 720],
  [1366, 768],
  [1920, 1080]
];

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
};

export const DEFAULT_TAS_PREFS: TasEditorPrefs = {
  vGrid: true,
  hGrid: true,
  bands: true,
  cellW: DEFAULT_CELL_W,
  trackOrder: [...DEFAULT_TRACK_ORDER],
  locked: [],
  gameWidth: 1024,
  gameHeight: 768,
  projectLevels: {},
  playSpeed: 1
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
  return seen.size === all.size
    ? (value as TasKey[])
    : [...DEFAULT_TRACK_ORDER];
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

/** 项目 → 关卡表来自 localStorage：只留 1~13 的整数。 */
function sanitizeLevels(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [name, level] of Object.entries(value)) {
    if (Number.isInteger(level) && level >= 1 && level <= 13) out[name] = level;
  }
  return out;
}

export function loadTasPrefs(): TasEditorPrefs {
  const raw = storage.getWithDefault<Partial<TasEditorPrefs>>(PREFS_KEY, {});
  return {
    vGrid: raw.vGrid ?? DEFAULT_TAS_PREFS.vGrid,
    hGrid: raw.hGrid ?? DEFAULT_TAS_PREFS.hGrid,
    bands: raw.bands ?? DEFAULT_TAS_PREFS.bands,
    cellW: raw.cellW ? clampCellW(raw.cellW) : DEFAULT_TAS_PREFS.cellW,
    trackOrder: sanitizeOrder(raw.trackOrder),
    locked: sanitizeLocked(raw.locked),
    gameWidth: clampInt(raw.gameWidth, 320, 3840, DEFAULT_TAS_PREFS.gameWidth),
    gameHeight: clampInt(
      raw.gameHeight,
      240,
      2160,
      DEFAULT_TAS_PREFS.gameHeight
    ),
    projectLevels: sanitizeLevels(raw.projectLevels),
    playSpeed:
      typeof raw.playSpeed === "number" &&
      Number.isFinite(raw.playSpeed) &&
      raw.playSpeed >= 0 &&
      raw.playSpeed <= MAX_PLAY_SPEED
        ? raw.playSpeed
        : DEFAULT_TAS_PREFS.playSpeed
  };
}

export function saveTasPrefs(prefs: TasEditorPrefs): void {
  storage.set(PREFS_KEY, prefs);
}
