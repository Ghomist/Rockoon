import storage from "@/utils/storage";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useInstancesStore } from "./instances";
import { detectSystemLanguage } from "@/i18n";

export const PREF_STORE_KEY = "rockoon-pref";

export const usePrefStore = defineStore(PREF_STORE_KEY, {
  state: () =>
    storage.getWithDefault<PreferenceStore>(PREF_STORE_KEY, {
      recent: undefined,
      hideWinWhenLaunch: true,
      killInstanceWhenExit: true,
      highscoreDefaultPlayer: "Mr. Default",
      enableBgv: true,
      backgroundBlur: 8,
      maskOpacity: 0.25,
      backgroundImage: undefined,
      indexExpireTime: 120,
      language: detectSystemLanguage(),
      theme: "auto",
      route: "/game",
      centerWindow: false,
      showWelcome: true,
      ingameMotd: true,
      ingameMotdContent: "Launched from Rockoon!"
    }),
  getters: {
    hasRecent: state =>
      useInstancesStore().instances.some(x => x.path === state.recent),
    recentInstance: state =>
      useInstancesStore().instances.find(x => x.path === state.recent),
    expireMs: state => state.indexExpireTime * 60 * 1000,
    darkMode: state =>
      state.theme === "dark" ||
      (state.theme === "auto" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
  },
  actions: {
    save() {
      storage.set(PREF_STORE_KEY, this.$state);
    },
    restore() {
      storage.set(PREF_STORE_KEY, {});
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePrefStore, import.meta.hot));
}
