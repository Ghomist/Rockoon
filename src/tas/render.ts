/**
 * 时间轴的 canvas 渲染（网格 + 刻度尺 + 缩略图）。
 *
 * 约定：传入的 ctx 已经按 devicePixelRatio 缩放过（setTransform(dpr,…)），
 * 所以这里一律用 CSS 像素坐标写，不用管物理像素。
 *
 * 性能：每帧只扫可见列（`visibleFrames`），一次 `frameView()` 复用 DataView。
 */

import { FRAME_SIZE, KEY_BITS, keyMask, type TasFile, type TasKey } from "./format";
import { collectRuns, frameView, type TasSelection } from "./editing";
import {
  MAX_CELL_W,
  RUN_CELL_W,
  formatTickLabel,
  paintableFrames,
  tickFrames,
  visibleFrames,
  xAtFrame,
  type Viewport
} from "./viewport";

// ---------------------------------------------------------------- 配色

export type TasPalette = {
  rulerBg: string;
  rulerText: string;
  rulerTick: string;
  rulerTickMinor: string;
  bandA: string;
  bandB: string;
  bandLine: string;
  vGrid: string;
  hGrid: string;
  cursorFill: string;
  cursorLine: string;
  /** 刻度尺上的「当前帧」小徽标：底色 / 文字。 */
  cursorBadge: string;
  cursorBadgeText: string;
  selectionFill: string;
  selectionLine: string;
  /** 锁定轨道上的半透明蒙版。 */
  lockVeil: string;
  hover: string;
  ghost: string;
  empty: string;
  /** 填充模式的矩形预览：置位 / 清除。 */
  fillSet: string;
  fillSetLine: string;
  fillClear: string;
  fillClearLine: string;
  miniDot: string;
  miniBox: string;
  miniBoxFill: string;
};

/**
 * 明暗两套配色写死在这里（canvas 拿不到 Tailwind 的 CSS 变量计算值）。
 * 值都挑的是「同一色系在两种背景上都能看清」的中间调。
 */
export function tasPalette(dark: boolean): TasPalette {
  return dark
    ? {
        rulerBg: "#18181b",
        rulerText: "#a1a1aa",
        rulerTick: "#52525b",
        rulerTickMinor: "#33333a",
        bandA: "#1b1b1f",
        bandB: "#232329",
        bandLine: "#34343c",
        vGrid: "#28282f",
        hGrid: "#32323a",
        cursorFill: "rgba(96,165,250,0.14)",
        cursorLine: "#60a5fa",
        cursorBadge: "#2563eb",
        cursorBadgeText: "#ffffff",
        selectionFill: "rgba(96,165,250,0.16)",
        selectionLine: "rgba(147,197,253,0.75)",
        lockVeil: "rgba(0,0,0,0.42)",
        hover: "rgba(226,232,240,0.28)",
        ghost: "rgba(226,232,240,0.45)",
        empty: "#141417",
        fillSet: "rgba(52,211,153,0.22)",
        fillSetLine: "rgba(52,211,153,0.9)",
        fillClear: "rgba(248,113,113,0.22)",
        fillClearLine: "rgba(248,113,113,0.9)",
        miniDot: "rgba(161,161,170,0.55)",
        miniBox: "rgba(212,212,216,0.75)",
        miniBoxFill: "rgba(212,212,216,0.10)"
      }
    : {
        rulerBg: "#fafafa",
        rulerText: "#52525b",
        rulerTick: "#c4c4c8",
        rulerTickMinor: "#e2e2e6",
        bandA: "#ffffff",
        bandB: "#f6f7f9",
        bandLine: "#dcdde1",
        vGrid: "#e9ebef",
        hGrid: "#e2e4e8",
        cursorFill: "rgba(59,130,246,0.13)",
        cursorLine: "#3b82f6",
        cursorBadge: "#3b82f6",
        cursorBadgeText: "#ffffff",
        selectionFill: "rgba(59,130,246,0.14)",
        selectionLine: "rgba(37,99,235,0.7)",
        lockVeil: "rgba(255,255,255,0.55)",
        hover: "rgba(24,24,27,0.22)",
        ghost: "rgba(24,24,27,0.35)",
        empty: "#f2f3f5",
        fillSet: "rgba(16,185,129,0.20)",
        fillSetLine: "rgba(5,150,105,0.9)",
        fillClear: "rgba(239,68,68,0.16)",
        fillClearLine: "rgba(220,38,38,0.9)",
        miniDot: "rgba(82,82,91,0.45)",
        miniBox: "rgba(63,63,70,0.8)",
        miniBoxFill: "rgba(63,63,70,0.08)"
      };
}

/** 每个按键一个颜色（胶囊填充）。明暗各一档，保证在交替背景上都够对比。 */
const TRACK_COLORS: Record<TasKey, { light: string; dark: string }> = {
  up: { light: "#10b981", dark: "#34d399" },
  down: { light: "#f59e0b", dark: "#fbbf24" },
  left: { light: "#0ea5e9", dark: "#38bdf8" },
  right: { light: "#8b5cf6", dark: "#a78bfa" },
  shift: { light: "#f43f5e", dark: "#fb7185" },
  space: { light: "#3b82f6", dark: "#60a5fa" },
  q: { light: "#14b8a6", dark: "#2dd4bf" },
  esc: { light: "#71717a", dark: "#a1a1aa" },
  enter: { light: "#d946ef", dark: "#e879f9" }
};

export function trackColor(key: TasKey, dark: boolean): string {
  return dark ? TRACK_COLORS[key].dark : TRACK_COLORS[key].light;
}

// ---------------------------------------------------------------- 绘制辅助

/** 圆角矩形路径（roundRect 在 WebView2 里一定有，但别赌）。 */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** 半透明：把 #rrggbb 变成 rgba()。 */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ---------------------------------------------------------------- 场景

export type Ghost = {
  /** 源块的帧区间（闭区间）。 */
  from: [number, number];
  fromTrack: number;
  dFrame: number;
  dTrack: number;
  color: string;
};

/** 填充模式的矩形预览（拖动中）。 */
export type FillPreview = { f0: number; f1: number; t0: number; t1: number; value: boolean };

export type SceneOptions = {
  tas: TasFile;
  order: TasKey[];
  frameMs: number;
  /** 胶囊块开头的文字（这一块多少帧）；不传就不写。 */
  blockLabel?: (frames: number) => string;
  vp: Viewport;
  width: number;
  height: number;
  rowH: number;
  rulerH: number;
  cursor: number;
  selection: TasSelection | null;
  /** 锁定的轨道（完全不可编辑）：画一层蒙版降对比度。 */
  locked: ReadonlySet<TasKey>;
  hover: { frame: number; track: number } | null;
  vGrid: boolean;
  hGrid: boolean;
  /** 「分区」：主刻度区间的交替底色（独立于纵线）。 */
  bands: boolean;
  dark: boolean;
  ghost: Ghost | null;
  /** 填充模式的矩形预览。 */
  fill: FillPreview | null;
};

const RULER_FONT = '11px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
/** 胶囊块开头的帧数标签：小一号，够看清又不抢眼。 */
const BLOCK_FONT = '10px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
/** 刻度尺上的「当前帧」徽标：和块标签同号。 */
const BADGE_FONT = '10px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
/** 徽标高度（刻度尺高 28px，居中放得下）。 */
const BADGE_H = 15;
/** 徽标左右内边距（单边） */
const BADGE_PAD_X = 5;
/** 徽标与光标竖线的间距。 */
const BADGE_GAP = 3;

/**
 * 画一整帧画面：刻度尺（顶部固定）+ 轨道网格 + 胶囊 + 各种高亮。
 * 只画可见列；背景按 0.5 秒交替着色。
 */
export function drawScene(ctx: CanvasRenderingContext2D, o: SceneOptions): void {
  const p = tasPalette(o.dark);
  const { width, height, rowH, rulerH } = o;
  const rowsTop = rulerH;
  const rowsH = height - rowsTop;
  const rowY = (track: number) => rowsTop + track * rowH - o.vp.scrollY;
  const limit = paintableFrames(o.tas.frameCount);
  const { first, last } = visibleFrames(o.vp, width);
  const drawFrom = Math.max(0, first);
  const drawTo = Math.min(last, limit);
  /** 低倍率：只在「区块模式」下画合并后的胶囊，单帧级的装饰全部跳过。 */
  const runMode = o.vp.cellW < RUN_CELL_W;

  ctx.save();
  // 轨道区底色（越界部分用更暗/更浅的 empty，暗示「这里已经超出可编辑范围」）
  ctx.fillStyle = p.empty;
  ctx.fillRect(0, rowsTop, width, Math.max(0, rowsH));
  if (drawTo > drawFrom) {
    ctx.fillStyle = p.bandA;
    ctx.fillRect(xAtFrame(o.vp, drawFrom), rowsTop, (drawTo - drawFrom) * o.vp.cellW, rowsH);
  }

  // 1) 「分区」：**每个主刻度区间**交替底色（独立开关，与纵线无关）
  const bandFrames = tickFrames(o.vp.cellW, o.frameMs).major;
  if (o.bands) {
    const bandFrom = Math.floor(drawFrom / bandFrames) * bandFrames;
    for (let f = bandFrom; f < drawTo; f += bandFrames) {
      const idx = Math.round(f / bandFrames);
      const x0 = Math.max(0, xAtFrame(o.vp, f));
      const x1 = Math.min(width, xAtFrame(o.vp, Math.min(f + bandFrames, drawTo)));
      if (x1 <= x0) continue;
      if (idx % 2 === 1) {
        ctx.fillStyle = p.bandB;
        ctx.fillRect(x0, rowsTop, x1 - x0, rowsH);
      }
      ctx.fillStyle = p.bandLine;
      ctx.fillRect(Math.round(x0), rowsTop, 1, rowsH);
    }
  }

  // 2) 横向网格线（轨道分隔）
  if (o.hGrid) {
    ctx.fillStyle = p.hGrid;
    for (let t = 0; t <= o.order.length; t++) {
      const y = Math.round(rowY(t));
      if (y < rowsTop - 1 || y > height) continue;
      ctx.fillRect(0, y, width, 1);
    }
  }

  // 3) 纵向网格线：太密就按 stride 抽稀，保证至少隔 6px 才画一根
  if (o.vGrid && !runMode) {
    const stride = Math.max(1, Math.ceil(6 / o.vp.cellW));
    ctx.fillStyle = p.vGrid;
    const start = Math.ceil(drawFrom / stride) * stride;
    for (let f = start; f <= drawTo; f += stride) {
      const x = Math.round(xAtFrame(o.vp, f));
      if (x < 0 || x > width) continue;
      ctx.fillRect(x, rowsTop, 1, rowsH);
    }
  }

  // 4) 胶囊：同轨道连续帧合并；块的开头标出这一段有多少帧
  const pad = rowH >= 18 ? 3 : 1;
  const radius = 4;
  // 块太窄 / 行太矮就不写
  const showBlockLabel = !!o.blockLabel && !runMode && rowH >= 16;
  for (let t = 0; t < o.order.length; t++) {
    const key = o.order[t];
    const y = rowY(t);
    if (y + rowH < rowsTop || y > height) continue;
    const runs = collectRuns(o.tas, key, drawFrom, drawTo);
    if (runs.length === 0) continue;
    ctx.fillStyle = withAlpha(trackColor(key, o.dark), o.dark ? 0.9 : 0.92);
    for (const [a, b] of runs) {
      const x = xAtFrame(o.vp, a);
      const w = Math.max(4, (b - a + 1) * o.vp.cellW - 1);
      roundedRect(ctx, x, y + pad, w, rowH - pad * 2, radius);
      ctx.fill();
    }
    if (!showBlockLabel) continue;
    const label = o.blockLabel!;
    const view = frameView(o.tas);
    const mask = keyMask(key);
    ctx.save();
    ctx.font = BLOCK_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 2;
    for (const [a, b] of runs) {
      const xLeft = Math.max(xAtFrame(o.vp, a), 0);
      const xRight = Math.min(xAtFrame(o.vp, b + 1), width);
      const visibleW = xRight - xLeft;
      if (visibleW <= 0) continue;
      // 标签里写的是这一段的**真实总帧数**。一段长按的 run 可能从屏幕左边一直
      // 延伸出去（放大后只看得到其中 10 帧），那时不能拿可见宽度当长度 ——
      // 所以从裁剪后的两端往外走到真正的 run 边界，再算帧数。
      const last = o.tas.frameCount - 1;
      let a0 = a;
      let b0 = Math.min(b, last);
      while (a0 > 0 && (view.getUint32((a0 - 1) * FRAME_SIZE + 4, true) & mask) !== 0) a0--;
      while (b0 < last && (view.getUint32((b0 + 1) * FRAME_SIZE + 4, true) & mask) !== 0) b0++;
      const text = label(b0 - a0 + 1);
      // 文字（含左右各 5px 内缩）在**可见的那一段**里放不下就不写
      if (ctx.measureText(text).width + 10 > visibleW) continue;
      const tx = xLeft + 5;
      const ty = y + rowH / 2;
      // 先描一圈深色再填白，保证在任意按键配色上都读得清
      ctx.strokeStyle = "rgba(0,0,0,0.38)";
      ctx.strokeText(text, tx, ty);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(text, tx, ty);
    }
    ctx.restore();
  }

  // 5) 选区
  if (o.selection) {
    const sel = o.selection;
    const x0 = Math.max(0, xAtFrame(o.vp, sel.f0));
    const x1 = Math.min(width, xAtFrame(o.vp, sel.f1 + 1));
    const y0 = rowY(sel.t0);
    const y1 = rowY(sel.t1 + 1);
    if (x1 > x0) {
      ctx.fillStyle = p.selectionFill;
      ctx.fillRect(x0, Math.max(rowsTop, y0), x1 - x0, Math.min(height, y1) - Math.max(rowsTop, y0));
      ctx.strokeStyle = p.selectionLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(x0) + 0.5,
        Math.round(Math.max(rowsTop, y0)) + 0.5,
        Math.max(1, x1 - x0 - 1),
        Math.max(1, Math.min(height, y1) - Math.max(rowsTop, y0) - 1)
      );
      // 选区是「一段时间」：起止帧的竖线要看得见
      ctx.fillStyle = p.selectionLine;
      const selTop = Math.max(rowsTop, y0);
      const selH = Math.min(height, y1) - selTop;
      ctx.fillRect(Math.round(x0), selTop, 2, selH);
      ctx.fillRect(Math.round(x1) - 2, selTop, 2, selH);
    }
  }

  // 5b) 填充模式的矩形预览（松手前）：置位用绿、清除用红
  if (o.fill) {
    const fl = o.fill;
    const x0 = Math.max(0, xAtFrame(o.vp, fl.f0));
    const x1 = Math.min(width, xAtFrame(o.vp, fl.f1 + 1));
    const y0 = Math.max(rowsTop, rowY(fl.t0));
    const y1 = Math.min(height, rowY(fl.t1 + 1));
    if (x1 > x0 && y1 > y0) {
      ctx.fillStyle = fl.value ? p.fillSet : p.fillClear;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = fl.value ? p.fillSetLine : p.fillClearLine;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
    }
  }

  // 5c) 锁定轨道：整行盖一层蒙版（画在胶囊/选区之上，一眼看出这行改不动）
  if (o.locked.size > 0) {
    ctx.fillStyle = p.lockVeil;
    for (let t = 0; t < o.order.length; t++) {
      if (!o.locked.has(o.order[t])) continue;
      const y = Math.max(rowsTop, rowY(t));
      const bottom = Math.min(height, rowY(t) + rowH);
      if (bottom > y) ctx.fillRect(0, y, width, bottom - y);
    }
  }

  // 6) Alt 拖块时的幽灵（半透明跟随）
  if (o.ghost) {
    const g = o.ghost;
    const t = g.fromTrack + g.dTrack;
    const y = rowY(t);
    if (y + rowH >= rowsTop && y <= height) {
      const x = xAtFrame(o.vp, g.from[0] + g.dFrame);
      const w = Math.max(4, (g.from[1] - g.from[0] + 1) * o.vp.cellW - 1);
      ctx.fillStyle = withAlpha(g.color, o.dark ? 0.45 : 0.5);
      roundedRect(ctx, x, y + pad, w, rowH - pad * 2, radius);
      ctx.fill();
      ctx.strokeStyle = p.ghost;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 7) 悬停格（区块模式下格子不到 1px，画了只会闪，跳过）
  if (o.hover && !runMode && o.hover.track < o.order.length) {
    const x = xAtFrame(o.vp, o.hover.frame);
    const y = rowY(o.hover.track);
    if (x + o.vp.cellW > 0 && x < width && y + rowH > rowsTop && y < height) {
      ctx.strokeStyle = p.hover;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(x) + 0.5,
        Math.round(Math.max(rowsTop, y)) + 0.5,
        Math.max(2, Math.min(o.vp.cellW, MAX_CELL_W) - 1),
        rowH - 1
      );
    }
  }

  // 8) 当前帧列
  const cursorX = xAtFrame(o.vp, o.cursor);
  if (cursorX + o.vp.cellW > 0 && cursorX < width) {
    ctx.fillStyle = p.cursorFill;
    ctx.fillRect(cursorX, rowsTop, Math.max(2, Math.min(o.vp.cellW, MAX_CELL_W)), rowsH);
    ctx.fillStyle = p.cursorLine;
    ctx.fillRect(Math.round(cursorX), rowsTop, 1, rowsH);
  }

  // 9) 刻度尺（最后画，盖在网格上）
  ctx.fillStyle = p.rulerBg;
  ctx.fillRect(0, 0, width, rowsTop);
  ctx.fillStyle = p.hGrid;
  ctx.fillRect(0, rowsTop - 1, width, 1);
  ctx.font = RULER_FONT;
  ctx.textBaseline = "middle";
  // 主/次刻度都是**帧**：次刻度先画（短），主刻度带标签 `50 (0.208s)`
  const { major, minor } = tickFrames(o.vp.cellW, o.frameMs);
  const rulerEnd = o.vp.scroll + width / o.vp.cellW;
  if (minor > 0) {
    ctx.fillStyle = p.rulerTickMinor;
    const startMinor = Math.floor(o.vp.scroll / minor) * minor;
    for (let f = startMinor; f <= rulerEnd; f += minor) {
      const x = Math.round(xAtFrame(o.vp, f));
      if (x < 0 || x > width) continue;
      ctx.fillRect(x, rowsTop - 7, 1, 6);
    }
  }
  ctx.fillStyle = p.rulerTick;
  const startMajor = Math.floor(o.vp.scroll / major) * major;
  for (let f = startMajor; f <= rulerEnd; f += major) {
    const x = Math.round(xAtFrame(o.vp, f));
    if (x < -40 || x > width + 40) continue;
    if (x >= 0) {
      ctx.fillRect(x, rowsTop - 12, 1, 11);
      const label = formatTickLabel(f, o.frameMs);
      // 标签右边会越过画布边缘就整个不画（刻度线还在）——被裁掉一半反而比没有更难读
      if (x + 4 + ctx.measureText(label).width <= width) {
        ctx.fillStyle = p.rulerText;
        ctx.fillText(label, x + 4, 9);
        ctx.fillStyle = p.rulerTick;
      }
    }
  }

  // 10) 当前帧徽标：贴着光标竖线、画在刻度尺里（钳制在画布内，靠边也不被裁）
  if (cursorX + o.vp.cellW > 0 && cursorX < width) {
    const text = String(o.cursor);
    ctx.save();
    ctx.font = BADGE_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const badgeW = ctx.measureText(text).width + BADGE_PAD_X * 2;
    // 默认挂在竖线右边；右边放不下就翻到左边，两头都放不下时再钳进画布
    let bx = cursorX + BADGE_GAP;
    if (bx + badgeW > width - 2) bx = cursorX - BADGE_GAP - badgeW;
    bx = Math.max(2, Math.min(width - badgeW - 2, bx));
    const by = Math.round((rowsTop - BADGE_H) / 2);
    ctx.fillStyle = p.cursorBadge;
    roundedRect(ctx, bx, by, badgeW, BADGE_H, BADGE_H / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.strokeText(text, bx + BADGE_PAD_X, by + BADGE_H / 2);
    ctx.fillStyle = p.cursorBadgeText;
    ctx.fillText(text, bx + BADGE_PAD_X, by + BADGE_H / 2);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 缩略图

export type MinimapOptions = {
  /** 整条时间轴的总帧数（含余量，跟网格一致）。 */
  totalFrames: number;
  /** 每像素聚合成一列：`dots[x]` 为 true 表示这一列有已绘制帧。 */
  dots: Uint8Array;
  width: number;
  height: number;
  dark: boolean;
};

/**
 * 缩略图：整条时间轴压成一条窄条，已绘制的帧用淡灰小点表示。
 * 采样在调用方（`dots` 的每个像素一列）做好，这里只负责画。
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, o: MinimapOptions): void {
  const p = tasPalette(o.dark);
  ctx.clearRect(0, 0, o.width, o.height);
  ctx.fillStyle = p.bandA;
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.fillStyle = p.miniDot;
  // 「小点」：每个像素列里画一小段居中短划，密的地方自然连成一条淡灰带
  const dotH = Math.max(3, Math.round(o.height * 0.1));
  const top = Math.round((o.height - dotH) / 2);
  for (let x = 0; x < o.dots.length; x++) {
    if (o.dots[x]) ctx.fillRect(x, top, 1, dotH);
  }
}

/** 每一像素列聚合「这段帧里有没有按键」。列数 = canvas 物理像素宽。 */
export function aggregateMinimap(tas: TasFile, widthPx: number, totalFrames: number): Uint8Array {
  const dots = new Uint8Array(Math.max(1, Math.ceil(widthPx)));
  const view = frameView(tas);
  const frames = tas.frameCount;
  // 缩略图的坐标系是「整条时间轴」（含右侧余量），所以列 → 帧要按 total 换算
  const total = Math.max(frames, totalFrames);
  const allMask = (1 << KEY_BITS.length) - 1;
  for (let x = 0; x < dots.length; x++) {
    const f0 = Math.floor((x * total) / dots.length);
    const f1 = Math.max(f0 + 1, Math.floor(((x + 1) * total) / dots.length));
    for (let f = f0; f < f1 && f < frames; f++) {
      if ((view.getUint32(f * FRAME_SIZE + 4, true) & allMask) !== 0) {
        dots[x] = 1;
        break;
      }
    }
  }
  return dots;
}
