import { usePrefStore } from "@/stores/pref";
import { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { debounce } from "./common";

let unListen: UnlistenFn;

export const initWindowSize = async () => {
  const pref = usePrefStore();
  const window = getCurrentWindow();

  if (pref.isMaximized) {
    await window.maximize();
  }

  unListen = await window.onResized(
    debounce(() => {
      window.isMaximized().then(isMaximized => {
        pref.isMaximized = isMaximized;
      });
    })
  );
};

export const unregisterWindowSizeHandler = () => unListen?.();
