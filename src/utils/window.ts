import { usePrefStore } from "@/stores/pref";
import { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

let unListen: UnlistenFn;

export const initWindowSize = async () => {
  const pref = usePrefStore();
  const window = getCurrentWindow();

  if (pref.isMaximized) {
    await window.maximize();
  } else if (pref.windowWidth && pref.windowHeight) {
    window.setSize(new LogicalSize(pref.windowWidth, pref.windowHeight));
  }

  unListen = await window.onResized(({ payload: { width, height } }) => {
    pref.windowWidth = width;
    pref.windowHeight = height;
    window.isMaximized().then(isMaximized => {
      pref.isMaximized = isMaximized;
    });
  });
};

export const unregisterWindowSizeHandler = () => unListen?.();
