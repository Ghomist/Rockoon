import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";

type SkyboxDirection = "Front" | "Back" | "Left" | "Right" | "Down";

export interface SkyboxLevel {
  level: number;
  letter: string;
  files: {
    [K in SkyboxDirection]?: string;
  };
}

interface Props {
  level: SkyboxLevel;
  skysPath: string;
  getImageUrl: (filename: string) => string;
}

const INITIAL_ROTATION_X = 25;
const INITIAL_ROTATION_Y = 30;
const INITIAL_SCALE = 1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SIZE = 300;
const OFFSET = 1;

function faceTransform(direction: SkyboxDirection): string {
  const half = SIZE / 2 - OFFSET;
  switch (direction) {
    case "Front":
      return `translateZ(-${half}px)`;
    case "Back":
      return `translateZ(${half}px) rotateY(180deg)`;
    case "Left":
      return `translateX(-${half}px) rotateY(90deg)`;
    case "Right":
      return `translateX(${half}px) rotateY(-90deg)`;
    case "Down":
      return `translateY(${half}px) rotateX(90deg)`;
  }
}

export default function SkyboxPreview({
  level,
  skysPath: _skysPath,
  getImageUrl
}: Props) {
  const t = useT();
  const [rotationX, setRotationX] = useState(INITIAL_ROTATION_X);
  const [rotationY, setRotationY] = useState(INITIAL_ROTATION_Y);
  const [scale, setScale] = useState(INITIAL_SCALE);

  // refs to avoid stale closures in document-level listeners
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const rotationXRef = useRef(rotationX);
  const rotationYRef = useRef(rotationY);
  const scaleRef = useRef(scale);
  rotationXRef.current = rotationX;
  rotationYRef.current = rotationY;
  scaleRef.current = scale;

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastXRef.current;
      const dy = e.clientY - lastYRef.current;
      const nextY = rotationYRef.current + dx * 0.5;
      const nextX = Math.max(
        -90,
        Math.min(90, rotationXRef.current + dy * 0.5)
      );
      setRotationY(nextY);
      setRotationX(nextX);
      lastXRef.current = e.clientX;
      lastYRef.current = e.clientY;
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
  };

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta)));
  };

  const reset = () => {
    setRotationX(INITIAL_ROTATION_X);
    setRotationY(INITIAL_ROTATION_Y);
    setScale(INITIAL_SCALE);
  };

  const directions: SkyboxDirection[] = [
    "Front",
    "Back",
    "Left",
    "Right",
    "Down"
  ];

  return (
    <div
      className="relative flex h-[75vh] w-full cursor-grab select-none flex-col items-center justify-center overflow-hidden active:cursor-grabbing"
      style={{ perspective: "800px" }}
      onMouseDown={onMouseDown}
      onWheel={onWheel}
    >
      <div
        className="relative"
        style={{
          width: `${SIZE}px`,
          height: `${SIZE}px`,
          transformStyle: "preserve-3d",
          transition: "transform 0.05s linear",
          transform: `rotateX(${-rotationX}deg) rotateY(${rotationY}deg) scale3d(${scale}, ${scale}, ${scale})`
        }}
      >
        {directions.map(dir => {
          const filename = level.files[dir];
          if (!filename) return null;
          const url = getImageUrl(filename);
          return (
            <div
              key={dir}
              className="absolute left-0 top-0 box-border flex items-center justify-center"
              style={{
                width: `${SIZE}px`,
                height: `${SIZE}px`,
                margin: "-1px",
                backgroundImage: url ? `url(${url})` : "none",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                transform: faceTransform(dir),
                backfaceVisibility: "hidden"
              }}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex translate-x-[-50%] items-center gap-3 rounded-lg bg-black/70 px-5 py-3 text-white">
        <span className="whitespace-nowrap text-sm">
          🖱️ {t("skys.dragToRotate")}
        </span>
        <span className="whitespace-nowrap text-sm">
          🔍 {t("skys.scrollToZoom")}
        </span>
        <span className="min-w-[45px] text-center text-sm font-bold">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="pointer-events-auto w-max cursor-pointer rounded bg-white/20 px-4 py-1.5 text-white transition-colors hover:bg-white/30"
          onClick={reset}
        >
          {t("skys.resetView")}
        </button>
      </div>
    </div>
  );
}
