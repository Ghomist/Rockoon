import storage from "@/utils/storage";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useFileStore } from "./fs";

const PREF_STORE_KEY = "rock-pref";

export const usePrefStore = defineStore(PREF_STORE_KEY, {
  state: () =>
    storage.getWithDefault<PreferenceStore>(PREF_STORE_KEY, {
      theme: "blue",
      recent: undefined,
      hideWinWhenLaunch: true,
      killInstanceWhenExit: true,
      highscoreDefaultPlayer: "Mr. Default"
    }),
  getters: {
    hasRecent: state =>
      useFileStore().instances.some(x => x.path === state.recent),
    recentInstance: state =>
      useFileStore().instances.find(x => x.path === state.recent)
  },
  actions: {
    save() {
      storage.set(PREF_STORE_KEY, this.$state);
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePrefStore, import.meta.hot));
}
