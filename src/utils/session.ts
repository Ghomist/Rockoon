import { useAppStore } from "@/stores/app";

/** pid → 第一次看到它在跑的时间（本次游戏时长从这里算） */
const sessionStarts = new Map<number, number>();

/**
 * 本次游戏已经跑了多少秒；没在跑就是 undefined。
 * runningInstanceTimestamp 每秒被 App 的轮询刷新一次，订阅它就能每秒重渲染。
 */
export function useSessionSeconds(): number | undefined {
  const pid = useAppStore(s => s.runningInstancePid);
  useAppStore(s => s.runningInstanceTimestamp);
  if (!pid) return undefined;
  if (!sessionStarts.has(pid)) sessionStarts.set(pid, Date.now());
  return Math.floor((Date.now() - sessionStarts.get(pid)!) / 1000);
}
