import ballance from "@/api/ballance";
import { useAppStore } from "./app";
import { useFileStore } from "./fs";
import { join } from "@tauri-apps/api/path";
import { usePrefStore } from "./pref";
import { checkBallanceFolder } from "@/utils/instance";

export const initStores = async () => {
  const appStore = useAppStore();
  const prefStore = usePrefStore();
  const fileStore = useFileStore();

  // select a instance as default
  if (prefStore.recent) {
    const instance = await checkBallanceFolder(prefStore.recent);
    if (instance) appStore.selected = instance;
  }
  if (!appStore.selected && fileStore.instances.length) {
    const instance = await checkBallanceFolder(fileStore.instances[0].path);
    if (instance) appStore.selected = instance;
  }

  // auto save instance options
  prefStore.$subscribe(() => prefStore.save());
  fileStore.$subscribe(() => fileStore.save());

  // auto load theme and color
  const html = document.getElementsByTagName("html")[0];
  const body = document.getElementsByTagName("body")[0];
  const loadTheme = () => {
    html.className = `theme-${prefStore.theme}`;
    if (prefStore.theme === "custom" && prefStore.customThemeColor) {
      html.style.setProperty("--color-prime", prefStore.customThemeColor);
    } else {
      html.style.removeProperty("--color-prime");
    }
    if (prefStore.isMaximized) {
      body.classList.add("on-maximized");
    } else {
      body.classList.remove("on-maximized");
    }
  };
  prefStore.$subscribe(loadTheme);

  // init theme
  loadTheme();

  // dump instance options
  appStore.$subscribe(
    () => {
      if (appStore.selected) {
        const instance = appStore.selected!;
        join(instance.path, "Database.tdb").then(path => {
          ballance.saveOptions(path, instance.options);
        });
      }
    },
    {
      deep: true
    }
  );
};
