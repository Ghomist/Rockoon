import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import storage from "@/utils/storage";
import { detectSystemLanguage } from "@/i18n";

export const PREF_STORE_KEY = "rockoon-pref";

const defaultState: PreferenceStore = {
  instancePath: undefined,
  playtime: 0,
  hideWinWhenLaunch: true,
  killInstanceWhenExit: true,
  highscoreDefaultPlayer: "Mr. Default",
  enableBgv: true,
  backgroundBlur: 8,
  maskOpacity: 0.25,
  backgroundImage: undefined,
  backgroundType: "isometric",
  indexExpireTime: 120,
  language: detectSystemLanguage(),
  theme: "auto",
  accent: "sky",
  route: "/game",
  centerWindow: false,
  showWelcome: true,
  mapOnlyMode: true,
  levelSlot: 0,
  ingameMotd: true,
  ingameMotdContent: "Launched from Rockoon!",
  confirmLaunchMap: true,
  enableTasEditor: false,
  patchVersions: {},
  seenPatchVersions: {},
  seenResourceUpdates: {},
  downloadProxyMode: "system",
  downloadProxy: "",
  downloadOriginMode: "primary"
};

interface PrefActions {
  /** Persist the entire store state to localStorage. */
  save: () => void;
  /** Wipe persisted state (used by onboarding reset). */
  restore: () => void;
}

export type PrefStore = PreferenceStore & PrefActions;

const persisted = storage.getWithDefault<PreferenceStore>(
  PREF_STORE_KEY,
  defaultState
);

/** 老版本 / 手改 localStorage 时兜底，避免代理模式变成无效值 */
const normalizeProxyMode = (mode?: string): DownloadProxyMode =>
  mode === "custom" || mode === "direct" ? mode : "system";

/** 下载站域名也兜一下，别让手改的 localStorage 把地址拼空 */
const normalizeOriginMode = (mode?: string): DownloadOriginMode =>
  mode === "mirror" ? "mirror" : "primary";

export const usePrefStore = create<PrefStore>()(
  subscribeWithSelector((set, get) => ({
    ...defaultState,
    ...persisted,
    downloadProxyMode: normalizeProxyMode(persisted.downloadProxyMode),
    downloadOriginMode: normalizeOriginMode(persisted.downloadOriginMode),
    save: () => storage.set(PREF_STORE_KEY, get()),
    restore: () => {
      storage.set(PREF_STORE_KEY, {});
      set(defaultState);
    }
  }))
);
