import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from "react";
import type { TasFile } from "@/tas/format";
import { aggregateMinimap, drawMinimap } from "@/tas/render";

/** 缩略图条的最大宽度（规格书：1000px 左右，再宽就内部压缩采样）。 */
const MAX_WIDTH = 1000;
const HEIGHT = 44;
/** 可视框边缘的抓取宽度（拖它 = 缩放）。 */
const HANDLE_W = 7;
/** 可视框最小宽度：比两个抓取条加起来还宽，否则两条重叠、拖不准。 */
const MIN_BOX_W = 2 * HANDLE_W;

export type TasMinimapHandle = {
  /** 更新可视框位置。直接写 DOM 样式，不走 React —— 时间轴每帧都会调它。 */
  setViewport: (first: number, last: number, totalFrames: number) => void;
  /** 数据变了（涂改 / 撤销 / 粘贴）：重画小点。 */
  refresh: () => void;
};

type Props = {
  tas: TasFile;
  dark: boolean;
  /** 数据版本号：变了就重画小点。 */
  version: number;
  /** 拖动可视框 → 跳到该位置（scroll 帧）。 */
  onPan: (scrollFrames: number) => void;
  /** 拖边缘 → 缩放：让 `[first, first+span)` 正好填满视口。 */
  onZoomRange: (first: number, span: number) => void;
  className?: string;
};

type DragMode = "pan" | "left" | "right";

/**
 * 底部缩略图（VSCode 风格）：整条时间轴压成一条，已绘制帧是淡灰小点，
 * 当前可视范围是一个淡灰方框 —— 框可以拖（跳转）、拖两边（缩放）。
 */
const TasMinimap = forwardRef<TasMinimapHandle, Props>(function TasMinimap(
  { tas, dark, version, onPan, onZoomRange, className },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  /** 可视框几何（帧）。timeline 每帧写这里 + 直接改 DOM。 */
  const geoRef = useRef({ first: 0, last: 1, total: 1 });
  const sizeRef = useRef({ w: 0, pxW: 0 });
  const dragRef = useRef<{ mode: DragMode; startX: number; first: number; last: number } | null>(
    null
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const { w, pxW } = sizeRef.current;
    if (!canvas || pxW <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dots = aggregateMinimap(tas, pxW, geoRef.current.total);
    drawMinimap(ctx, {
      totalFrames: geoRef.current.total,
      dots,
      width: pxW,
      height: Math.round(HEIGHT * dpr),
      dark
    });
  }, [dark, tas]);

  const place = useCallback(() => {
    const box = boxRef.current;
    const { w } = sizeRef.current;
    const { first, last, total } = geoRef.current;
    if (!box || w <= 0) return;
    const x = (first / total) * w;
    const width = Math.max(MIN_BOX_W, ((last - first) / total) * w);
    box.style.transform = `translateX(${Math.max(0, Math.min(w - 4, x))}px)`;
    box.style.width = `${Math.min(w - Math.max(0, x), width)}px`;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setViewport(first, last, totalFrames) {
        geoRef.current = { first, last, total: Math.max(1, totalFrames) };
        place();
      },
      refresh() {
        paint();
      }
    }),
    [place, paint]
  );

  // 尺寸自适应：宽度取容器宽度与 1000px 的较小值
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const w = Math.min(MAX_WIDTH, Math.max(120, host.clientWidth - 2));
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w, pxW: Math.round(w * dpr) };
      paint();
      place();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [paint, place]);

  // 数据/主题变了：重画小点（位置由 timeline 驱动，这里不用管）
  useEffect(() => {
    paint();
  }, [paint, version]);

  const frameAtX = (clientX: number) => {
    const host = hostRef.current;
    const { w } = sizeRef.current;
    if (!host || w <= 0) return 0;
    const rect = host.getBoundingClientRect();
    const x = Math.max(0, Math.min(w, clientX - rect.left));
    return (x / w) * geoRef.current.total;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const role = (e.target as HTMLElement).dataset.role ?? "track";
    const { first, last } = geoRef.current;
    const frame = frameAtX(e.clientX);
    if (role === "track") {
      // 空白处点击：把视口中心挪过去
      onPan(frame - (last - first) / 2);
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件下 setPointerCapture 可能抛；不该因此让交互整体挂掉
    }
    dragRef.current = {
      mode: role === "left" ? "left" : role === "right" ? "right" : "pan",
      startX: e.clientX,
      first,
      last
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const host = hostRef.current;
    const { w } = sizeRef.current;
    if (!host || w <= 0) return;
    const total = geoRef.current.total;
    const deltaFrames = ((e.clientX - drag.startX) / w) * total;
    if (drag.mode === "pan") {
      onPan(drag.first + deltaFrames);
      return;
    }
    const frame = frameAtX(e.clientX);
    if (drag.mode === "left") {
      const first = Math.min(frame, drag.last - 2);
      onZoomRange(Math.max(0, first), drag.last - Math.max(0, first));
    } else {
      const last = Math.max(frame, drag.first + 2);
      onZoomRange(drag.first, last - drag.first);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 同上
    }
  };

  return (
    <div className={className}>
      <div
        ref={hostRef}
        className="relative select-none"
        style={{ height: HEIGHT, maxWidth: MAX_WIDTH }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} className="block rounded-sm" />
        <div
          ref={boxRef}
          data-role="pan"
          className="absolute top-0 bottom-0 cursor-grab rounded-sm border active:cursor-grabbing"
          style={{
            borderColor: "var(--color-muted-foreground)",
            backgroundColor: "color-mix(in oklab, var(--color-foreground) 8%, transparent)",
            left: 0
          }}
        >
          <div
            data-role="left"
            className="absolute top-0 bottom-0 cursor-col-resize"
            style={{ left: 0, width: HANDLE_W }}
          >
            <div className="pointer-events-none absolute inset-y-1 left-1 w-0.5 rounded-full bg-current opacity-50" />
          </div>
          <div
            data-role="right"
            className="absolute top-0 bottom-0 cursor-col-resize"
            style={{ right: 0, width: HANDLE_W }}
          >
            <div className="pointer-events-none absolute inset-y-1 right-1 w-0.5 rounded-full bg-current opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
});

export default TasMinimap;
