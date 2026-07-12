import { instanceBackend } from "@/backend/instance";
import { acceptHMRUpdate, defineStore } from "pinia";
import { usePrefStore } from "./pref";

export const useAppStore = defineStore("app", {
  state: (): AppStore => ({
    selectedInstanceData: undefined,
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0
  }),
  actions: {
    /** 加载单一实例的 InstanceData 并安装 RockoonIO mod */
    async loadInstance(path: string) {
      const newInstanceData = await instanceBackend.getInstanceData(path);
      if (newInstanceData) {
        this.selectedInstanceData = newInstanceData;
        instanceBackend.installRockoonMod(newInstanceData);
        return true;
      }
      return false;
    },
    updateInstanceRunningTime() {
      if (this.runningInstancePath && this.runningInstanceTimestamp > 0) {
        const prefStore = usePrefStore();
        const elapsedSeconds = Math.floor(
          (Date.now() - this.runningInstanceTimestamp) / 1000
        );
        if (elapsedSeconds > 0) {
          prefStore.playtime += elapsedSeconds;
          this.runningInstanceTimestamp = Date.now();
        }
      }
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
