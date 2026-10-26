import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefStore } from "@/stores/pref";

/**
 * pref.theme + 系统偏好 → 该不该用暗色，并顺手把 `dark` 类挂到 <html> 上。
 *
 * App.tsx 里有一份同逻辑的 `useDarkMode()`（那边不带挂类，由 App 自己 toggle）。
 * 单独窗口（TAS 编辑器）走的是另一条入口，拿不到 App 的那份，所以这里再放一份——
 * 5 行逻辑，重复比强行抽公共依赖更省事。
 */
export function useDarkMode(): boolean {
  const theme = usePrefStore(s => s.theme);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = theme === "dark" || (theme === "auto" && systemDark);

  useThemeEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, isDark);

  return isDark;
}

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 同一次提交里明暗和主题色一起变（比如导入设置）时并进同一个过渡，
// 两个过渡叠在一起会互相打断，中间帧新旧颜色混着
let pending: (() => void)[] | null = null;
function runInTransition(apply: () => void) {
  if (pending) {
    pending.push(apply);
    return;
  }
  pending = [apply];
  document.startViewTransition(() => {
    const fns = pending ?? [];
    pending = null;
    fns.forEach(fn => fn());
  });
}

/**
 * 改 <html> 上的主题类 / 属性。首次直接改（layout effect，不闪）；之后用
 * View Transition 整页淡入淡出过去，不然几百个颜色一帧硬切，看着很生硬。
 */
export function useThemeEffect<T>(apply: () => void, value: T) {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current || reducedMotion() || !document.startViewTransition) {
      first.current = false;
      apply();
      return;
    }
    runInTransition(apply);
    // apply 每次都是新闭包，只按 value 触发
  }, [value]);
}

/** pref.accent → <html data-accent>，styles.css 按它切主题色。主窗口和 TAS 窗口都要调用 */
export function useAccent(): AccentId {
  const accent = usePrefStore(s => s.accent) ?? "sky";
  // 首次在第一帧绘制前就挂上，不然非默认主题色启动时会先闪一下天空蓝
  useThemeEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, accent);
  return accent;
}

/**
 * 当前主色的 rgb（canvas 画粒子用：它只认 hex/rgb，不认 oklch）。
 * 主题色或明暗一变就重新取一次。
 */
export function usePrimaryRgb(): string {
  const [rgb, setRgb] = useState("#808080");
  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx || !value) return;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      setRgb(
        "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("")
      );
    };
    read();
    // data-accent / .dark 可能在 View Transition 回调里才真正改，直接盯着 <html>
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent"]
    });
    return () => mo.disconnect();
  }, []);
  return rgb;
}

/** 主题色预设（色板展示用；真正的配色在 styles.css 的 [data-accent] 里，两边要一致） */
export const ACCENTS: { id: AccentId; h: number; c: number }[] = [
  { id: "sky", h: 262, c: 0.19 },
  { id: "indigo", h: 275, c: 0.2 },
  { id: "violet", h: 300, c: 0.2 },
  { id: "rose", h: 8, c: 0.19 },
  { id: "amber", h: 55, c: 0.15 },
  { id: "emerald", h: 158, c: 0.14 },
  { id: "teal", h: 200, c: 0.12 },
  { id: "slate", h: 255, c: 0.035 }
];
