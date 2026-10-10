/**
 * 时间轴视口（纯换算，不碰 DOM）。
 *
 * 横向**没有滚动条**：所有浏览都靠「每帧像素宽 cellW」+「左边缘帧号 scroll」两个数
 * 算出来。scroll 用「帧」而不是「像素」当单位，缩放时锚点保持不动才直观。
 */

import { GROW_MARGIN_FRAMES } from "./editing";

export type Viewport = {
  /** 每帧像素宽（MIN_CELL_W ~ MAX_CELL_W）。 */
  cellW: number;
  /** 视口左边缘对应的帧（浮点：平滑插值时会落在两帧之间）。 */
  scroll: number;
  /** 纵向滚动（像素）。9 条轨道一般放得下，窗口很矮时才用得上。 */
  scrollY: number;
};

/**
 * 缩小的下限故意做得极小：低倍率下渲染会自动切成「区块模式」（见 RUN_CELL_W），
 * 工作量与可见帧数无关，所以不会因为缩得太小而卡 —— 于是 S 基本可以一路缩到
 * 整个文件尽收眼底（19600 帧 × 0.02 ≈ 392px），而不是“缩到某个比例就停”。
 */
export const MIN_CELL_W = 0.02;
export const MAX_CELL_W = 64;
export const DEFAULT_CELL_W = 14;
/**
 * 低于这个每帧宽度就进入「区块模式」：只画 `collectRuns` 合并出来的连续区块，
 * 不再画单帧级的装饰（纵向网格线、悬停格）—— 那些东西在这个倍率下只有零点几
 * 像素宽，画了既看不清又纯粹浪费。可见工作量始终与**可见帧数**无关（胶囊已经
 * 合并过），所以任意倍率下的工作量都是有界的。
 */
export const RUN_CELL_W = 4;
/** 缩放/平移的平滑时间常数（毫秒）。指数平滑：约 3τ 到位 ≈ 120ms。 */
export const SMOOTH_TAU_MS = 40;

/** 视口尺寸约束（布局算好后传给 clampViewport）。 */
export type TimelineBounds = {
  /** 数据里的帧数。 */
  frameCount: number;
  /** 网格区宽度（不含轨道头）。 */
  widthPx: number;
  /** 网格区高度（含刻度尺）。 */
  heightPx: number;
  rowCount: number;
  rowH: number;
  rulerH: number;
};

export function clampCellW(w: number): number {
  return Math.min(MAX_CELL_W, Math.max(MIN_CELL_W, w));
}

/** 屏幕 x → 帧号（浮点）。 */
export function frameAtX(vp: Viewport, x: number): number {
  return vp.scroll + x / vp.cellW;
}

/** 帧号 → 屏幕 x。 */
export function xAtFrame(vp: Viewport, frame: number): number {
  return (frame - vp.scroll) * vp.cellW;
}

/** 可绘制的总帧数 = 数据帧数 + 右侧余量（画进余量里会自动加长数据）。 */
export function paintableFrames(frameCount: number): number {
  return frameCount + GROW_MARGIN_FRAMES;
}

/** 可见帧区间（半开 `[first, last)`，已夹在 [0, paintable] 内）。 */
export function visibleFrames(vp: Viewport, widthPx: number): { first: number; last: number } {
  const first = Math.max(0, Math.floor(vp.scroll));
  const last = Math.max(first, Math.ceil(vp.scroll + widthPx / vp.cellW));
  return { first, last };
}

/** 把视口夹进合法范围：左侧不能为负、右侧要够得着余量末尾；纵向同理。 */
export function clampViewport(vp: Viewport, b: TimelineBounds): Viewport {
  const cellW = clampCellW(vp.cellW);
  const span = b.widthPx / cellW;
  // 内容比视口窄时贴左（scroll=0），否则最多滚到「余量末尾」
  const maxScroll = Math.max(0, paintableFrames(b.frameCount) - span);
  const scroll = Math.min(maxScroll, Math.max(0, vp.scroll));
  const rowsH = b.rowCount * b.rowH;
  const maxY = Math.max(0, rowsH - (b.heightPx - b.rulerH));
  const scrollY = Math.min(maxY, Math.max(0, vp.scrollY));
  return { cellW, scroll, scrollY };
}

/** 以 anchorX（指针位置）为锚点缩放：指针下的那一帧保持不动。 */
export function zoomAt(vp: Viewport, factor: number, anchorX: number): Viewport {
  const anchorFrame = frameAtX(vp, anchorX);
  const cellW = clampCellW(vp.cellW * factor);
  return { cellW, scroll: anchorFrame - anchorX / cellW, scrollY: vp.scrollY };
}

/** 指数平滑：把 cur 往 target 拉，dtMs 为两帧间隔。 */
export function smooth(cur: number, target: number, tau: number, dtMs: number): number {
  const k = 1 - Math.exp(-dtMs / tau);
  const next = cur + (target - cur) * k;
  return Math.abs(target - next) < 1e-4 ? target : next;
}

/** 视口插值。cellW 在**对数空间**上插值，缩放才是匀速的（不然放大先快后慢很怪）。 */
export function smoothViewport(
  cur: Viewport,
  target: Viewport,
  tau: number,
  dtMs: number
): Viewport {
  return {
    cellW: Math.exp(smooth(Math.log(cur.cellW), Math.log(target.cellW), tau, dtMs)),
    scroll: smooth(cur.scroll, target.scroll, tau, dtMs),
    scrollY: smooth(cur.scrollY, target.scrollY, tau, dtMs)
  };
}

/** 视口是否已经到位（到位就停掉 rAF，别空转）。 */
export function viewportSettled(cur: Viewport, target: Viewport): boolean {
  return (
    Math.abs(cur.cellW - target.cellW) < 1e-3 &&
    Math.abs(cur.scroll - target.scroll) < 1e-3 &&
    Math.abs(cur.scrollY - target.scrollY) < 1e-3
  );
}

/**
 * 分区/主刻度的基准：**0.5 秒一个大区**，一个大区多少帧按当前全局帧时长折算
 *（`frameMs = 10` → 50 帧，`= 5` → 100 帧，`= 20` → 25 帧）。
 */
export const BAND_SECONDS = 0.5;

/** 大区标签至少要隔这么宽才排得下（`50 (0.500s)` 差不多就这么宽）。 */
const MAJOR_MIN_PX = 110;
/** 次刻度至少要隔这么宽才画。 */
const MINOR_MIN_PX = 10;
/**
 * 缩放不够时把基准按这些倍数放大 —— 大区于是变成 0.5s 的整数倍（1s / 2s / 5s…），
 * 这是唯一允许偏离 0.5s 的情况，目的是不让标签糊成一片。
 */
const MAJOR_SCALES = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * 刻度尺密度：主刻度 = 0.5 秒（换算成帧），返回**帧步长**。
 * 帧时长变了结果会变，所以调用方必须把当前的 `frameMs` 传进来。
 */
export function tickFrames(cellW: number, frameMs: number): { major: number; minor: number } {
  const base = frameMs > 0 ? (BAND_SECONDS * 1000) / frameMs : 50;
  let major = Math.max(1, Math.round(base));
  for (const k of MAJOR_SCALES) {
    major = Math.max(1, Math.round(base * k));
    if (major * cellW >= MAJOR_MIN_PX) break;
  }
  // 次刻度取大区的 1/5 或 1/2（必须是整数帧），间距太窄就不要
  const minor =
    [major / 5, major / 2].find(
      m => Number.isInteger(m) && m >= 1 && m * cellW >= MINOR_MIN_PX
    ) ?? 0;
  return { major, minor };
}

/** 秒 → 标签里的时间：≥60s 用 `1:23.456`，否则 `12.345s`（固定 3 位小数）。 */
export function formatFrameTime(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
  }
  return `${sec.toFixed(3)}s`;
}

/** 主刻度标签：帧号 + 括号内的时间，例如 `50 (0.208s)`。 */
export function formatTickLabel(frame: number, frameMs: number): string {
  return `${frame} (${formatFrameTime((frame * frameMs) / 1000)})`;
}
