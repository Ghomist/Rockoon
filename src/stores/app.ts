import { instanceBackend } from "@/backend/instance";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useInstancesStore } from "./instances";
import { usePrefStore } from "./pref";

export const useAppStore = defineStore("app", {
  state: (): AppStore => ({
    selectedInstanceData: undefined,
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0
  }),
  getters: {
    selectedInstance: state =>
      state.selectedInstanceData
        ? useInstancesStore().findInstance(state.selectedInstanceData.path)
        : undefined
  },
  actions: {
    async changeSelect(path: string) {
      const newInstanceData = await instanceBackend.getInstanceData(path);
      if (newInstanceData) {
        this.selectedInstanceData = newInstanceData;
        usePrefStore().recent = newInstanceData.path;
        instanceBackend.installRockoonMod(newInstanceData);
        return true;
      }
      return false;
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
