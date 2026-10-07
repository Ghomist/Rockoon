import { useEffect, useState } from "react";
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return isDark;
}
