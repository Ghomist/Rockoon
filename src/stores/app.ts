import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { instanceBackend } from "@/backend/instance";
import { usePrefStore } from "./pref";

interface AppState {
  selectedInstanceData: InstanceData | undefined;
  runningInstancePid: number | undefined;
  runningInstancePath: string | undefined;
  runningInstanceTimestamp: number;
  refreshKey: number;
  /** 开屏状态：initStores 跑完前，界面还不知道到底有没有实例 */
  booted: boolean;
  markBooted: () => void;
  loadInstance: (path: string) => Promise<boolean>;
  /**
   * 把这次游戏已经过去的时长计入 playtime。`minSeconds`：攒够这么多秒才记
   * （轮询时传 30：playtime 在 pref 里，每记一次就整份写一次 localStorage）。
   */
  updateInstanceRunningTime: (minSeconds?: number) => void;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    selectedInstanceData: undefined,
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0,
    refreshKey: 0,
    booted: false,

    /** Load the single instance's InstanceData and install RockoonIO mod. */
    async loadInstance(path) {
      const newInstanceData = await instanceBackend.getInstanceData(path);
      if (newInstanceData) {
        set({ selectedInstanceData: newInstanceData });
        instanceBackend.installRockoonMod(newInstanceData);
        return true;
      }
      return false;
    },

    markBooted() {
      set({ booted: true });
    },

    updateInstanceRunningTime(minSeconds = 0) {
      const { runningInstancePath, runningInstanceTimestamp } = get();
      if (!runningInstancePath || runningInstanceTimestamp <= 0) return;
      const elapsedSeconds = Math.floor(
        (Date.now() - runningInstanceTimestamp) / 1000
      );
      if (elapsedSeconds > 0 && elapsedSeconds >= minSeconds) {
        usePrefStore.setState(prev => ({
          playtime: prev.playtime + elapsedSeconds,
          lastPlayedAt: Date.now()
        }));
        // 只推进记过的整秒，零头留到下次，长时间游戏也不会少算
        set({
          runningInstanceTimestamp:
            runningInstanceTimestamp + elapsedSeconds * 1000
        });
      }
    },

    /** Increment refresh counter to signal all pages to re-fetch data. */
    triggerRefresh() {
      set(s => ({ refreshKey: s.refreshKey + 1 }));
    }
  }))
);
