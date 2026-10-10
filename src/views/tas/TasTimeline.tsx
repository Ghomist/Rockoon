import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from "react";
import { Lock, Unlock } from "lucide-react";
import { KEY_META, type TasFile, type TasKey } from "@/tas/format";
import {
  fillRange,
  frameView,
  grabRun,
  hasKeyAt,
  growToFit,
  moveBlock,
  normalizeSelection,
  paintCell,
  snapDragToRun,
  type TasSelection
} from "@/tas/editing";
import { drawScene, trackColor, type FillPreview } from "@/tas/render";
import {
  SMOOTH_TAU_MS,
  clampCellW,
  clampViewport,
  frameAtX,
  paintableFrames,
  smoothViewport,
  viewportSettled,
  zoomAt,
  type TimelineBounds,
  type Viewport
} from "@/tas/viewport";
import { t } from "@/i18n";
import TasMinimap, { type TasMinimapHandle } from "./TasMinimap";

/** 鼠标模式：选择（默认）/ 绘制 / 填充 / 录入。 */
export type TasMouseMode = "select" | "draw" | "fill" | "record";

/** 轨道行高、顶部刻度尺高度。 */
export const ROW_H = 26;
export const RULER_H = 28;
/** 轨道头宽度（布局用，canvas 不需要知道）。 */
export const TRACK_HEADER_W = 132;

/** 长按 W/S 的缩放速率：cellW 按 e^(rate·dt) 变化（0.8 ≈ 0.9 秒翻一倍）。 */
/**
 * 长按 W/S 的缩放速度（单位：**每秒的自然对数倍率**，即 factor = e^(±rate·dt)）。
 * 按时间算而不是按帧，所以帧率掉下来时速度不变。
 * 这个值只给键盘用，与滚轮无关：滚轮一“格”约 1.25×（e^0.22），快速滚动的等效速率
 * 约 2.2/s，这里取 2.4/s 略快一档 —— 1 秒能从 14px/帧 到 160px/帧 左右。
 */
const HOLD_ZOOM_PER_SEC = 2.4;
/** 长按 A/D 的平移速率（每秒移动几个视口宽）。 */
const HOLD_PAN_SPANS_PER_SEC = 0.9;
/** 长按缩放时回写 onCellWChange 的最小间隔（毫秒）。每帧都写会带着 React 树每帧重渲染。 */
const CELL_W_REPORT_MS = 80;

type HeldKeys = { w: boolean; s: boolean; a: boolean; d: boolean };

/** 一次可撤销操作的句柄：`commit` 入栈，`discard` 不入栈（数据保持现状）。 */
export type OpHandle = { commit: () => void; discard: () => void };

export type TasTimelineHandle = {
  /** 缩放（锚点 = 指针位置）。dir > 0 放大。 */
  zoomStep: (dir: number) => void;
  /** 让某一帧进入视野（Home / End / 方向键之后用）。 */
  reveal: (frame: number) => void;
  /** 缩放成「整条时间轴刚好铺满」。 */
  fitAll: () => void;
};

type Props = {
  tas: TasFile;
  frameMs: number;
  /** 胶囊块开头的文字（这一块多少帧），一般是 `51 帧` / `51 frames`。 */
  blockLabel: (frames: number) => string;
  order: TasKey[];
  dark: boolean;
  vGrid: boolean;
  hGrid: boolean;
  /** 「分区」：主刻度区间的交替底色（独立于纵线）。 */
  bands: boolean;
  /** 鼠标模式。 */
  mode: TasMouseMode;
  cursor: number;
  selection: TasSelection | null;
  /** 锁定的轨道：绘制/擦除/覆盖/拖块/选区删除/粘贴全部跳过它。 */
  locked: ReadonlySet<TasKey>;
  /** 录入模式：`Space` / `Esc` 被录入接管，不再当视图修饰键用。 */
  recording: boolean;
  /** 数据版本号：变了说明数据被别处改过（撤销 / 粘贴 / 裁尾）。 */
  version: number;
  /** 初始每帧像素宽（来自偏好）。 */
  defaultCellW: number;
  onCellWChange: (cellW: number) => void;
  onCursor: (frame: number) => void;
  onSelection: (sel: TasSelection | null) => void;
  onOrderChange: (order: TasKey[]) => void;
  /** 切换某条轨道的锁定状态。 */
  onToggleLock: (key: TasKey) => void;
  onBeginOp: () => OpHandle;
  /** 数据被就地改了（渲染层自己重画；父组件用它标脏 / 记 lastTouched）。 */
  onMutated: (lastTouched: number) => void;
  /** 选择模式下右键：把指针位置 + 命中的格交给父组件弹菜单（画/填充模式的右键仍是擦除/清除）。 */
  onMenu?: (at: { x: number; y: number; frame: number; track: number }) => void;
};

type Cell = { frame: number; track: number };

type Drag =
  | {
      kind: "pan";
      startX: number;
      startY: number;
      scroll: number;
      scrollY: number;
    }
  | { kind: "scrub" }
  | { kind: "region"; anchor: Cell }
  | { kind: "box"; anchor: Cell }
  | {
      kind: "paint";
      value: boolean;
      op: OpHandle;
      changed: boolean;
      last: Cell;
      /** `Shift` 单行约束：限制在这一行（null = 不限制）。 */
      rowLock: number | null;
    }
  | {
      kind: "fill";
      value: boolean;
      op: OpHandle;
      anchor: Cell;
      /** `Shift` 单行约束。 */
      rowLock: number | null;
    }
  | {
      kind: "move";
      from: [number, number];
      fromTrack: number;
      op: OpHandle;
      anchor: Cell;
      followSel?: boolean;
    };

/** 焦点在输入框里时别抢键盘（帧时长输入框要用 W/S/A/D 打字）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * 时间轴：刻度尺 + 轨道网格（canvas）+ 冻结的轨道头 + 底部缩略图。
 *
 * 两条约定：
 * - 所有高频状态（视口 / 拖动 / 悬停）都放在 ref 里，渲染循环直接读 ref 重画 canvas，
 *   **不走 React 状态** —— 否则拖动时每帧一次 re-render，60fps 就没了。
 * - 数据是就地改的（`TasFile.data` 是 Uint8Array），改完调 `requestDraw()`。
 */
const TasTimeline = forwardRef<TasTimelineHandle, Props>(
  function TasTimeline(props, ref) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const headerListRef = useRef<HTMLDivElement | null>(null);
    const miniRef = useRef<TasMinimapHandle | null>(null);

    /** 每次渲染刷新：长时间存活的回调（rAF、window 监听）统一读它，避免闭包过期。 */
    const propsRef = useRef(props);
    const sizeRef = useRef({ w: 0, h: 0 });
    const boundsRef = useRef<TimelineBounds>({
      frameCount: props.tas.frameCount,
      widthPx: 0,
      heightPx: 0,
      rowCount: props.order.length,
      rowH: ROW_H,
      rulerH: RULER_H
    });
    const vpRef = useRef<Viewport>({
      cellW: props.defaultCellW,
      scroll: 0,
      scrollY: 0
    });
    const targetRef = useRef<Viewport>({
      cellW: props.defaultCellW,
      scroll: 0,
      scrollY: 0
    });
    const dragRef = useRef<Drag | null>(null);
    const hoverRef = useRef<Cell | null>(null);
    const ghostRef = useRef<{
      from: [number, number];
      fromTrack: number;
      dFrame: number;
      dTrack: number;
      color: string;
    } | null>(null);
    const cursorOverrideRef = useRef<number | null>(null);
    /** 填充模式的矩形预览（拖动中）。 */
    const fillRef = useRef<FillPreview | null>(null);
    const mouseRef = useRef({ x: 0, y: 0, inside: false });
    /** 待处理的悬停位置：pointermove 只写这里，命中测试/重画交给 rAF（每帧最多一次） */
    const pendingHoverRef = useRef<{ x: number; y: number } | null>(null);
    const spaceRef = useRef(false);
    /** 悬停位置在刻度尺上（拖动 = 移动光标）。指针样式用。 */
    const hoverRulerRef = useRef(false);
    /** Alt 按着（Alt + 拖 = 搬块）。指针样式用。 */
    const altRef = useRef(false);
    /** 长按中的 W/S/A/D。真正的步进在 rAF 循环里按 dt 做，不依赖系统按键重复。 */
    const heldRef = useRef<HeldKeys>({
      w: false,
      s: false,
      a: false,
      d: false
    });
    const cellWReportRef = useRef(0);
    const headerDragRef = useRef<{ index: number } | null>(null);
    const rafRef = useRef(0);
    const lastTickRef = useRef(0);
    const needsDrawRef = useRef(true);
    const miniDirtyRef = useRef(true);
    const miniVersionRef = useRef(props.version);
    const lastTasRef = useRef<TasFile | null>(props.tas);

    // ---------------------------------------------------------------- 尺寸 / 边界

    const refreshBounds = () => {
      boundsRef.current = {
        frameCount: propsRef.current.tas.frameCount,
        widthPx: sizeRef.current.w,
        heightPx: sizeRef.current.h,
        rowCount: propsRef.current.order.length,
        rowH: ROW_H,
        rulerH: RULER_H
      };
      return boundsRef.current;
    };

    // ---------------------------------------------------------------- 绘制

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { w, h } = sizeRef.current;
      if (!canvas || !ctx || w <= 0 || h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p = propsRef.current;
      const vp = vpRef.current;
      drawScene(ctx, {
        tas: p.tas,
        order: p.order,
        frameMs: p.frameMs,
        blockLabel: p.blockLabel,
        vp,
        width: w,
        height: h,
        rowH: ROW_H,
        rulerH: RULER_H,
        cursor: cursorOverrideRef.current ?? p.cursor,
        selection: p.selection,
        locked: p.locked,
        hover: hoverRef.current,
        vGrid: p.vGrid,
        hGrid: p.hGrid,
        bands: p.bands,
        dark: p.dark,
        ghost: ghostRef.current,
        fill: fillRef.current
      });
      // 轨道头纵向跟随（横向天然冻结：它是 canvas 之外的 DOM）
      if (headerListRef.current) {
        headerListRef.current.style.transform = `translateY(${-vp.scrollY}px)`;
      }
      // 缩略图可视框
      miniRef.current?.setViewport(
        vp.scroll,
        vp.scroll + w / vp.cellW,
        paintableFrames(p.tas.frameCount)
      );
    };

    const requestDraw = () => {
      needsDrawRef.current = true;
      ensureLoop();
    };

    const ensureLoop = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    };

    /**
     * 长按 W/S/A/D 的步进：每帧按 dt 走一步，按下立刻生效。
     * **只能从 tick 里调**：它直接改 targetRef、不走 requestDraw —— 否则会在 tick
     * 内部又排一个 rAF，变成两条循环互相叠加。
     */
    const stepHeld = (now: number, dtMs: number) => {
      const h = heldRef.current;
      const b = boundsRef.current;
      if (b.widthPx <= 0) return;
      const dt = dtMs / 1000;
      let stepped = false;
      if (h.w !== h.s) {
        const factor = Math.exp((h.w ? 1 : -1) * HOLD_ZOOM_PER_SEC * dt);
        targetRef.current = clampViewport(
          zoomAt(targetRef.current, factor, anchorX()),
          b
        );
        stepped = true;
      }
      if (h.a !== h.d) {
        const span = b.widthPx / targetRef.current.cellW;
        const dir = h.d ? 1 : -1;
        targetRef.current = clampViewport(
          {
            ...targetRef.current,
            scroll:
              targetRef.current.scroll +
              dir * span * HOLD_PAN_SPANS_PER_SEC * dt
          },
          b
        );
        stepped = true;
      }
      if (!stepped) return;
      needsDrawRef.current = true;
      // 面板上的百分比不需要 60fps，节流一下
      if (now - cellWReportRef.current >= CELL_W_REPORT_MS) {
        cellWReportRef.current = now;
        propsRef.current.onCellWChange(targetRef.current.cellW);
      }
    };

    const tick = (now: number) => {
      rafRef.current = 0;
      // 注意：不能在这里把 lastTickRef 清零（每帧都调 requestDraw 会让 dt 永远为 0，
      // 结果就是平滑动画永远不前进）；空闲后的第一帧用一个默认间隔起步。
      const prev = lastTickRef.current;
      const dt = prev ? Math.min(64, now - prev) : 16.7;
      lastTickRef.current = now;
      stepHeld(now, dt);
      const cur = vpRef.current;
      const target = targetRef.current;
      if (!viewportSettled(cur, target)) {
        // 指数平滑：约 3τ ≈ 120ms 到位
        vpRef.current = clampViewport(
          smoothViewport(cur, target, SMOOTH_TAU_MS, dt),
          boundsRef.current
        );
        needsDrawRef.current = true;
      }
      const pend = pendingHoverRef.current;
      if (pend) {
        pendingHoverRef.current = null;
        applyHover(pend.x, pend.y);
        updateCursor();
      }
      if (miniDirtyRef.current) {
        miniDirtyRef.current = false;
        miniRef.current?.refresh();
      }
      if (needsDrawRef.current) {
        needsDrawRef.current = false;
        draw();
      }
      if (!viewportSettled(vpRef.current, targetRef.current)) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        lastTickRef.current = 0; // 停下来了，下一段动画重新计时
      }
    };

    // 每次渲染同步 props / 边界，并按需重画
    useEffect(() => {
      propsRef.current = props;
      // 换了文件：视口回原点（不然会停在上一份文件的滚动位置）
      if (lastTasRef.current !== props.tas) {
        lastTasRef.current = props.tas;
        const next = { cellW: props.defaultCellW, scroll: 0, scrollY: 0 };
        vpRef.current = next;
        targetRef.current = next;
        miniDirtyRef.current = true;
      }
      refreshBounds();
      if (props.version !== miniVersionRef.current) {
        miniVersionRef.current = props.version;
        miniDirtyRef.current = true;
      }
      requestDraw();
    });

    useLayoutEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const update = () => {
        sizeRef.current = { w: wrap.clientWidth, h: wrap.clientHeight };
        const b = refreshBounds();
        targetRef.current = clampViewport(targetRef.current, b);
        vpRef.current = clampViewport(vpRef.current, b);
        requestDraw();
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(wrap);
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(
      () => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      },
      []
    );

    // ---------------------------------------------------------------- 视口操作

    const anchorX = () =>
      mouseRef.current.inside ? mouseRef.current.x : sizeRef.current.w / 2;

    const applyZoom = (factor: number) => {
      targetRef.current = clampViewport(
        zoomAt(targetRef.current, factor, anchorX()),
        boundsRef.current
      );
      propsRef.current.onCellWChange(targetRef.current.cellW);
      requestDraw();
    };

    const applyScroll = (scroll: number) => {
      targetRef.current = clampViewport(
        { ...targetRef.current, scroll },
        boundsRef.current
      );
      requestDraw();
    };

    const zoomRange = (first: number, span: number) => {
      const b = boundsRef.current;
      // 尺寸还没量出来时不要缩放：那会把 cellW 算成 0（= 最小档）并写进偏好
      if (b.widthPx <= 0) return;
      const cellW = clampCellW(b.widthPx / Math.max(2, span));
      targetRef.current = clampViewport(
        { cellW, scroll: first, scrollY: targetRef.current.scrollY },
        b
      );
      propsRef.current.onCellWChange(cellW);
      requestDraw();
    };

    useImperativeHandle(
      ref,
      () => ({
        zoomStep: (dir: number) => applyZoom(dir > 0 ? 1.3 : 1 / 1.3),
        reveal: (frame: number) => {
          const b = boundsRef.current;
          const vp = targetRef.current;
          const span = b.widthPx / vp.cellW;
          if (frame < vp.scroll + 1 || frame > vp.scroll + span - 2) {
            applyScroll(frame - span * 0.3);
          }
        },
        fitAll: () => {
          const b = boundsRef.current;
          zoomRange(0, paintableFrames(b.frameCount));
        }
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    // ---------------------------------------------------------------- 键盘（视口相关）

    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Alt" && !altRef.current) {
          altRef.current = true;
          updateCursor();
        }
        if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey)
          return;
        switch (e.key) {
          case "w":
          case "W":
            heldRef.current.w = true;
            ensureLoop(); // 按下立刻就起步，不等系统按键重复
            e.preventDefault();
            break;
          case "s":
          case "S":
            heldRef.current.s = true;
            ensureLoop();
            e.preventDefault();
            break;
          case "a":
          case "A":
            heldRef.current.a = true;
            ensureLoop();
            e.preventDefault();
            break;
          case "d":
          case "D":
            heldRef.current.d = true;
            ensureLoop();
            e.preventDefault();
            break;
          case " ":
            // 录入模式下 Space 是录入键（跳跃），不再临时平移视图
            if (propsRef.current.recording) break;
            if (!spaceRef.current) {
              spaceRef.current = true;
              updateCursor();
            }
            e.preventDefault();
            break;
          case "Escape": {
            // 录入模式下 Esc 是录入键，不用于取消拖动/选区
            if (propsRef.current.recording) break;
            // 取消拖动：数据已经改过的（涂改）要留下撤销记录，否则用户撤不掉
            const drag = dragRef.current;
            if (drag?.kind === "paint") {
              if (drag.changed) drag.op.commit();
              else drag.op.discard();
              cursorOverrideRef.current = null;
            } else if (drag?.kind === "fill") {
              drag.op.discard();
              fillRef.current = null;
            } else if (drag?.kind === "move") {
              drag.op.discard();
            }
            ghostRef.current = null;
            dragRef.current = null;
            requestDraw();
            break;
          }
          default:
            break;
        }
      };
      const releaseHold = () => {
        const h = heldRef.current;
        if (!h.w && !h.s && !h.a && !h.d) return;
        h.w = h.s = h.a = h.d = false;
        cellWReportRef.current = 0;
        // 把最终值同步出去（面板百分比 / 偏好持久化）
        propsRef.current.onCellWChange(targetRef.current.cellW);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (k === "w" || k === "s" || k === "a" || k === "d") {
          heldRef.current[k] = false;
          cellWReportRef.current = 0;
          propsRef.current.onCellWChange(targetRef.current.cellW);
        }
        if (e.key === " ") {
          spaceRef.current = false;
          updateCursor();
        }
        if (e.key === "Alt") {
          altRef.current = false;
          updateCursor();
        }
      };
      const onBlur = () => {
        spaceRef.current = false;
        altRef.current = false;
        releaseHold();
        updateCursor();
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------------------------------------------------------------- 滚轮

    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const b = boundsRef.current;
        const x = e.clientX - rect.left;
        // 滚轮横向分量（或 Shift）= 左右平移；其余一律缩放，锚点 = 鼠标指针位置
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const dx =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          targetRef.current = clampViewport(
            {
              ...targetRef.current,
              scroll: targetRef.current.scroll + dx / targetRef.current.cellW
            },
            b
          );
        } else {
          // 向上（deltaY < 0）放大、向下缩小；指针下的那一帧保持不动
          targetRef.current = clampViewport(
            zoomAt(targetRef.current, Math.exp(-e.deltaY * 0.0022), x),
            b
          );
          propsRef.current.onCellWChange(targetRef.current.cellW);
        }
        requestDraw();
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------------------------------------------------------------- 指针

    const cellAtXY = (
      clientX: number,
      clientY: number,
      rect: { left: number; top: number }
    ): Cell & { inRuler: boolean } => {
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const vp = vpRef.current;
      return {
        frame: Math.floor(frameAtX(vp, x)),
        track: Math.floor((y - RULER_H + vp.scrollY) / ROW_H),
        inRuler: y < RULER_H
      };
    };

    const cellAt = (e: React.PointerEvent<HTMLCanvasElement>) =>
      cellAtXY(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());

    /**
     * 悬停命中 + 记住鼠标位置。**只在 rAF 里调**（每帧一次）：真实鼠标常在 1000Hz 以上，
     * 事件级别做命中测试等于白烧 CPU，会把旁边跑着的游戏挤掉帧。
     */
    const applyHover = (clientX: number, clientY: number) => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      mouseRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
        inside: true
      };
      const hit = cellAtXY(clientX, clientY, rect);
      hoverRulerRef.current = hit.inRuler;
      const p = propsRef.current;
      const inside =
        !hit.inRuler &&
        hit.track >= 0 &&
        hit.track < p.order.length &&
        hit.frame >= 0 &&
        hit.frame < paintableFrames(p.tas.frameCount);
      const next = inside ? { frame: hit.frame, track: hit.track } : null;
      const prev = hoverRef.current;
      const same =
        (next === null && prev === null) ||
        (next !== null &&
          prev !== null &&
          next.frame === prev.frame &&
          next.track === prev.track);
      if (!same) {
        hoverRef.current = next;
        needsDrawRef.current = true;
      }
    };

    /**
     * 画布的鼠标指针：按「正在拖什么 → 修饰键 → 悬停的格子 → 鼠标模式」决定。
     * 只在 rAF（悬停变了）、按下 / 松开、Space / Alt 变化、换模式时调，不在每个指针事件里调。
     *
     * 拖动：平移 / 搬块 = grabbing，拖刻度尺 = ew-resize，填充 = cell，其余 = crosshair；
     * 不拖：Space 按着 = grab，刻度尺 = ew-resize，锁定的轨道 = not-allowed，
     * Alt 悬停在一段按键上 = grab（可以拖走），选择模式悬停在按键上 = pointer，
     * 绘制 / 录入 = crosshair，填充 = cell，空白处 = default。
     */
    const updateCursor = () => {
      const el = canvasRef.current;
      if (!el) return;
      const p = propsRef.current;
      const drag = dragRef.current;
      let cursor = "default";
      if (drag) {
        cursor =
          drag.kind === "pan" || drag.kind === "move"
            ? "grabbing"
            : drag.kind === "scrub"
              ? "ew-resize"
              : drag.kind === "fill"
                ? "cell"
                : "crosshair";
      } else if (spaceRef.current && !p.recording) {
        cursor = "grab";
      } else if (mouseRef.current.inside && hoverRulerRef.current) {
        cursor = "ew-resize";
      } else if (mouseRef.current.inside && hoverRef.current) {
        const cell = hoverRef.current;
        const key = p.order[cell.track];
        if (key && p.locked.has(key)) {
          cursor = "not-allowed";
        } else if (key) {
          const onKey =
            cell.frame < p.tas.frameCount &&
            hasKeyAt(frameView(p.tas), cell.frame, key);
          if (altRef.current && onKey) cursor = "grab";
          else if (p.mode === "select") cursor = onKey ? "pointer" : "default";
          else if (p.mode === "fill") cursor = "cell";
          else cursor = "crosshair";
        }
      }
      if (el.style.cursor !== cursor) el.style.cursor = cursor;
    };

    // 换鼠标模式 / 锁轨道之后立刻刷新指针（不等鼠标再动一下）
    useEffect(() => {
      updateCursor();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.mode, props.locked]);

    /** 数据被就地改了：标脏缩略图 + 告诉父组件。 */
    const markMutated = (frame: number) => {
      miniDirtyRef.current = true;
      propsRef.current.onMutated(frame);
    };

    /** 涂一格（必要时把数据加长）。锁定轨道、越界返回 false。 */
    const paintOne = (cell: Cell, value: boolean): boolean => {
      const p = propsRef.current;
      const key = p.order[cell.track];
      if (!key || p.locked.has(key)) return false;
      if (cell.frame < 0 || cell.frame >= paintableFrames(p.tas.frameCount))
        return false;
      if (value) growToFit(p.tas, cell.frame, p.frameMs);
      const changed = paintCell(p.tas, cell.frame, key, value);
      if (changed) markMutated(cell.frame);
      cursorOverrideRef.current = cell.frame;
      return changed;
    };

    /** 填充拖动：矩形 = 锚点行..当前行 × 锚点帧..当前帧（Shift = 只改起点那一行）。 */
    const updateFillPreview = (
      drag: Extract<Drag, { kind: "fill" }>,
      hit: Cell
    ): void => {
      const p = propsRef.current;
      const a = drag.anchor;
      const lastTrack = p.order.length - 1;
      const t0 = drag.rowLock ?? Math.max(0, Math.min(a.track, hit.track));
      const t1 =
        drag.rowLock ?? Math.min(lastTrack, Math.max(a.track, hit.track));
      fillRef.current = {
        f0: Math.max(0, Math.min(a.frame, hit.frame)),
        f1: Math.max(a.frame, hit.frame),
        t0,
        t1,
        value: drag.value
      };
    };

    const capture = (e: React.PointerEvent<HTMLCanvasElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 合成事件下可能抛；不该因此让交互整体挂掉
      }
    };

    const applyOpacity = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: true
      };
      return rect;
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      altRef.current = e.altKey;
      handlePointerDown(e);
      updateCursor();
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = propsRef.current;
      const rect = applyOpacity(e);
      const hit = cellAt(e);

      // 平移：中键，或按住 Space 拖（剪辑软件习惯）
      if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
        dragRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          scroll: targetRef.current.scroll,
          scrollY: targetRef.current.scrollY
        };
        capture(e);
        e.preventDefault();
        return;
      }
      if (e.button !== 0 && e.button !== 2) return;

      // 刻度尺：拖动 = 移动光标（scrub）
      if (hit.inRuler) {
        dragRef.current = { kind: "scrub" };
        p.onCursor(
          Math.max(
            0,
            Math.min(paintableFrames(p.tas.frameCount) - 1, hit.frame)
          )
        );
        capture(e);
        return;
      }
      if (hit.track < 0 || hit.track >= p.order.length || hit.frame < 0) return;
      const key = p.order[hit.track];

      // Alt = 拖块（优先于一切）。三种鼠标模式下都保留。
      if (e.button === 0 && e.altKey) {
        if (p.locked.has(key)) return;
        // 已选中了一段（单轨）且 Alt 按在它里面 → 只搬这一小段；否则搬横向连通的一整块（用户 m09881 #1）
        const sel = p.selection;
        const inSel =
          !!sel &&
          sel.t0 === sel.t1 &&
          sel.t1 === hit.track &&
          hit.frame >= sel.f0 &&
          hit.frame <= sel.f1;
        const run = inSel
          ? ([sel.f0, sel.f1] as [number, number])
          : grabRun(p.tas, hit.frame, key);
        if (!run) return;
        cursorOverrideRef.current = hit.frame;
        dragRef.current = {
          kind: "move",
          from: run,
          fromTrack: hit.track,
          anchor: { frame: hit.frame, track: hit.track },
          followSel: inSel,
          op: p.onBeginOp()
        };
        ghostRef.current = {
          from: run,
          fromTrack: hit.track,
          dFrame: 0,
          dTrack: 0,
          color: trackColor(key, p.dark)
        };
        capture(e);
        requestDraw();
        return;
      }

      // 录入模式：拖出一段时间（纵向盖满全部轨道），期间按下的键由编辑器写进这段区间。
      if (p.mode === "record") {
        dragRef.current = {
          kind: "region",
          anchor: { frame: hit.frame, track: hit.track }
        };
        p.onSelection(
          normalizeSelection(hit.frame, 0, hit.frame, p.order.length - 1)
        );
        capture(e);
        return;
      }

      // 选择模式：点按键 = 选中整段；在行内拖 = 框选中这一段的一部分；点空格 = 空选（时长 0）。
      if (p.mode === "select") {
        const sel = p.selection;
        // 右键点在已有选区内（单轨）就不动选区，直接弹菜单 —— 这样「复制/剪切」作用于框选的那一小段
        const keepSel =
          e.button === 2 &&
          !!sel &&
          sel.t0 === sel.t1 &&
          hit.track === sel.t0 &&
          hit.frame >= sel.f0 &&
          hit.frame <= sel.f1;
        const run = grabRun(p.tas, hit.frame, key);
        if (!keepSel) {
          p.onCursor(hit.frame);
          p.onSelection({
            f0: run ? run[0] : hit.frame,
            f1: run ? run[1] : hit.frame,
            t0: hit.track,
            t1: hit.track
          });
        }
        if (e.button === 2) {
          p.onMenu?.({
            x: e.clientX,
            y: e.clientY,
            frame: hit.frame,
            track: hit.track
          });
          return;
        }
        // 空格：只落一个空选（时长 0，用户可以把时长改成 >0 新建按键），不进拖动
        if (!run) return;
        dragRef.current = {
          kind: "box",
          anchor: { frame: hit.frame, track: hit.track }
        };
        capture(e);
        requestDraw();
        return;
      }

      // `Shift` = 单行约束（绘制/填充模式内）：只有起点那一行会被改
      const rowLock = e.shiftKey ? hit.track : null;

      // 填充模式：左/右拖出一个矩形，松手才提交（一次撤销单位）
      if (p.mode === "fill") {
        const fillDrag: Extract<Drag, { kind: "fill" }> = {
          kind: "fill",
          value: e.button !== 2,
          op: p.onBeginOp(),
          anchor: { frame: hit.frame, track: hit.track },
          rowLock
        };
        dragRef.current = fillDrag;
        updateFillPreview(fillDrag, { frame: hit.frame, track: hit.track });
        capture(e);
        requestDraw();
        return;
      }

      // 绘制模式：左键 = 绘制、右键 = 擦除，语义固定，按住拖过去连续涂。
      const value = e.button !== 2;
      if (p.selection) p.onSelection(null); // 普通点击取消选区
      const paintDrag: Extract<Drag, { kind: "paint" }> = {
        kind: "paint",
        value,
        op: p.onBeginOp(),
        changed: false,
        last: { frame: hit.frame, track: hit.track },
        rowLock
      };
      dragRef.current = paintDrag;
      paintDrag.changed = paintOne(
        { frame: hit.frame, track: hit.track },
        value
      );
      capture(e);
      requestDraw();
      void rect;
    };

    /** 选择模式下右键弹菜单（指针位置 + 命中的格）。其它模式的右键保留原义：画 = 擦除、填充 = 清除。 */
    const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const p = propsRef.current;
      if (p.mode !== "select") return;
      e.preventDefault();
      const hit = cellAt(e as unknown as React.PointerEvent<HTMLCanvasElement>);
      if (!hit) return;
      p.onMenu?.({
        x: e.clientX,
        y: e.clientY,
        frame: hit.frame,
        track: hit.track
      });
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        // 悬停提示：只记下位置，命中和重画都在 rAF 里做一次（见 applyHover）
        pendingHoverRef.current = { x: e.clientX, y: e.clientY };
        altRef.current = e.altKey;
        ensureLoop();
        return;
      }
      applyOpacity(e);
      const hit = cellAt(e);
      switch (drag.kind) {
        case "pan": {
          const cellW = targetRef.current.cellW;
          const next = clampViewport(
            {
              cellW,
              scroll: drag.scroll - (e.clientX - drag.startX) / cellW,
              scrollY: drag.scrollY - (e.clientY - drag.startY)
            },
            boundsRef.current
          );
          targetRef.current = next;
          vpRef.current = next; // 拖动平移要 1:1 跟手，不做插值
          requestDraw();
          break;
        }
        case "scrub": {
          const limit = paintableFrames(propsRef.current.tas.frameCount) - 1;
          propsRef.current.onCursor(Math.max(0, Math.min(limit, hit.frame)));
          break;
        }
        case "region": {
          const p = propsRef.current;
          p.onSelection(
            normalizeSelection(
              drag.anchor.frame,
              0,
              hit.frame,
              p.order.length - 1
            )
          );
          break;
        }
        case "box": {
          // 框选：不许跨行，且只收拢到「有按键」的那一段上
          const p = propsRef.current;
          const key = p.order[drag.anchor.track];
          const [f0, f1] = key
            ? snapDragToRun(
                p.tas,
                key,
                drag.anchor.frame,
                drag.anchor.frame,
                hit.frame
              )
            : [drag.anchor.frame, hit.frame];
          p.onSelection({
            f0,
            f1,
            t0: drag.anchor.track,
            t1: drag.anchor.track
          });
          break;
        }
        case "paint": {
          // `Shift` 单行约束：鼠标纵向跨到别的轨道也不写那些轨道
          const track = drag.rowLock ?? hit.track;
          const from = drag.last;
          if (track === from.track) {
            // 拖动跨了很多格也要一格不漏地涂过去
            const step = hit.frame >= from.frame ? 1 : -1;
            for (let f = from.frame; ; f += step) {
              if (paintOne({ frame: f, track }, drag.value))
                drag.changed = true;
              if (f === hit.frame) break;
            }
          } else if (paintOne({ frame: hit.frame, track }, drag.value)) {
            drag.changed = true;
          }
          drag.last = { frame: hit.frame, track };
          hoverRef.current = { frame: hit.frame, track };
          requestDraw();
          break;
        }
        case "fill": {
          updateFillPreview(drag, { frame: hit.frame, track: hit.track });
          hoverRef.current = { frame: hit.frame, track: hit.track };
          requestDraw();
          break;
        }
        case "move": {
          const p = propsRef.current;
          const dTrack = Math.max(
            -drag.fromTrack,
            Math.min(
              p.order.length - 1 - drag.fromTrack,
              hit.track - drag.anchor.track
            )
          );
          ghostRef.current = {
            from: drag.from,
            fromTrack: drag.fromTrack,
            dFrame: Math.max(-drag.from[0], hit.frame - drag.anchor.frame),
            dTrack,
            color: trackColor(p.order[drag.fromTrack], p.dark)
          };
          requestDraw();
          break;
        }
        default:
          break;
      }
    };

    const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
      handleEndDrag(e);
      updateCursor();
    };

    const handleEndDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // 同上
      }
      if (!drag) {
        ghostRef.current = null;
        return;
      }
      if (drag.kind === "paint") {
        if (drag.changed) drag.op.commit();
        else drag.op.discard();
        if (cursorOverrideRef.current !== null) {
          propsRef.current.onCursor(cursorOverrideRef.current);
          cursorOverrideRef.current = null;
        }
      } else if (drag.kind === "fill") {
        // 松手才提交：整个矩形算一次撤销单位
        const fl = fillRef.current;
        const p = propsRef.current;
        fillRef.current = null;
        if (
          fl &&
          fillRange(
            p.tas,
            fl.f0,
            fl.f1,
            fl.t0,
            fl.t1,
            p.order,
            fl.value,
            p.locked,
            p.frameMs
          )
        ) {
          drag.op.commit();
          markMutated(fl.f0);
          propsRef.current.onCursor(fl.f0);
        } else {
          drag.op.discard();
        }
      } else if (drag.kind === "move") {
        const g = ghostRef.current;
        const p = propsRef.current;
        // 源轨道或目标轨道被锁住就不搬（不然会往锁住的轨道里写数据）
        if (
          g &&
          (g.dFrame !== 0 || g.dTrack !== 0) &&
          !p.locked.has(p.order[drag.fromTrack]) &&
          !p.locked.has(p.order[drag.fromTrack + g.dTrack])
        ) {
          moveBlock(
            p.tas,
            drag.from,
            drag.fromTrack,
            drag.from[0] + g.dFrame,
            drag.fromTrack + g.dTrack,
            p.order,
            p.frameMs
          );
          miniDirtyRef.current = true;
          p.onMutated(drag.from[0] + g.dFrame);
          drag.op.commit();
          // 搬的是框选出来的那一小段：选区跟着走，接着还能继续拖或改时长
          if (drag.followSel) {
            p.onSelection({
              f0: drag.from[0] + g.dFrame,
              f1: drag.from[1] + g.dFrame,
              t0: drag.fromTrack + g.dTrack,
              t1: drag.fromTrack + g.dTrack
            });
          }
        } else {
          drag.op.discard();
        }
        cursorOverrideRef.current = null;
      }
      ghostRef.current = null;
      requestDraw();
    };

    // ---------------------------------------------------------------- 轨道头（拖动排序）

    const onHeaderDown = (
      e: React.PointerEvent<HTMLDivElement>,
      index: number
    ) => {
      if (e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      headerDragRef.current = { index };
    };

    const onHeaderMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = headerDragRef.current;
      const list = headerListRef.current;
      if (!drag || !list) return;
      const order = propsRef.current.order;
      const rect = list.getBoundingClientRect();
      const target = Math.max(
        0,
        Math.min(order.length - 1, Math.floor((e.clientY - rect.top) / ROW_H))
      );
      if (target === drag.index) return;
      const next = [...order];
      const [item] = next.splice(drag.index, 1);
      next.splice(target, 0, item);
      drag.index = target;
      propsRef.current.onOrderChange(next);
    };

    const onHeaderUp = (e: React.PointerEvent<HTMLDivElement>) => {
      headerDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    // ---------------------------------------------------------------- 渲染

    const p = props;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {/* 轨道头：横向冻结（canvas 之外的 DOM），纵向由绘制循环 translateY 跟随 */}
          <div
            className="flex shrink-0 flex-col border-r"
            style={{ width: TRACK_HEADER_W }}
          >
            <div className="shrink-0 border-b" style={{ height: RULER_H }} />
            <div className="min-h-0 flex-1 overflow-hidden">
              <div ref={headerListRef} className="will-change-transform">
                {p.order.map((key, index) => {
                  const locked = p.locked.has(key);
                  return (
                    <div
                      key={key}
                      title={t(`tas.trackNames.${key}`)}
                      onPointerDown={e => onHeaderDown(e, index)}
                      onPointerMove={onHeaderMove}
                      onPointerUp={onHeaderUp}
                      onPointerCancel={onHeaderUp}
                      className="flex cursor-grab items-center gap-2 border-b px-2 select-none hover:bg-accent active:cursor-grabbing"
                      style={{ height: ROW_H }}
                    >
                      <button
                        type="button"
                        aria-label={
                          locked ? t("tas.unlockTrack") : t("tas.lockTrack")
                        }
                        aria-pressed={locked}
                        title={
                          locked ? t("tas.unlockTrack") : t("tas.lockTrack")
                        }
                        // 轨道头本身是拖动排序的手柄，锁按钮不能把 pointerdown 让上去
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          p.onToggleLock(key);
                        }}
                        className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-background/60"
                      >
                        {locked ? (
                          <Lock className="size-3 text-amber-500" />
                        ) : (
                          <Unlock className="size-3 text-muted-foreground/60" />
                        )}
                      </button>
                      <span
                        className={`flex min-w-0 items-center gap-2 ${
                          locked ? "opacity-50" : ""
                        }`}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: trackColor(key, p.dark) }}
                        />
                        <span className="truncate font-mono text-xs">
                          {KEY_META[key].short}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 网格（canvas） */}
          <div
            ref={wrapRef}
            className="relative min-w-0 flex-1 overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              className="block touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onContextMenu={onContextMenu}
              onPointerCancel={endDrag}
              onPointerLeave={() => {
                mouseRef.current.inside = false;
                if (hoverRef.current) {
                  hoverRef.current = null;
                  requestDraw();
                }
                updateCursor();
              }}
            />
          </div>
        </div>

        {/* 缩略图 */}
        <TasMinimap
          ref={miniRef}
          tas={p.tas}
          dark={p.dark}
          version={p.version}
          onPan={applyScroll}
          onZoomRange={zoomRange}
          className="shrink-0 border-t px-2 py-1.5"
        />
      </div>
    );
  }
);

export default TasTimeline;
