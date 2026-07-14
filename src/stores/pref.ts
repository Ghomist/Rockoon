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
  backgroundType: "grid",
  indexExpireTime: 120,
  language: detectSystemLanguage(),
  theme: "auto",
  route: "/game",
  centerWindow: false,
  showWelcome: true,
  mapOnlyMode: true,
  ingameMotd: true,
  ingameMotdContent: "Launched from Rockoon!",
  confirmLaunchMap: true
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

export const usePrefStore = create<PrefStore>()(
  subscribeWithSelector((set, get) => ({
    ...defaultState,
    ...persisted,
    save: () => storage.set(PREF_STORE_KEY, get()),
    restore: () => {
      storage.set(PREF_STORE_KEY, {});
      set(defaultState);
    }
  }))
);
