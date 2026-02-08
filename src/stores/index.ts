import backend from "@/backend";
import { switchLanguage } from "@/i18n";
import { router } from "@/routers";
import { withDebounce } from "@/utils/common";
import { join } from "@tauri-apps/api/path";
import { watch } from "vue";
import { useAppStore } from "./app";
import { useInstancesStore } from "./instances";
import { usePrefStore } from "./pref";

export const initStores = async () => {
  const appStore = useAppStore();
  const prefStore = usePrefStore();
  const instancesStore = useInstancesStore();

  // auto save instance options
  prefStore.$subscribe(withDebounce(prefStore.save));
  instancesStore.$subscribe(withDebounce(instancesStore.save));

  // select a instance as default
  if (prefStore.recent) {
    await appStore.changeSelect(prefStore.recent);
  }
  if (!appStore.selectedInstanceData && instancesStore.instances.length) {
    await appStore.changeSelect(instancesStore.instances[0].path);
  }

  if (!appStore.selectedInstanceData) {
    router.replace("/instances");
  } else if (prefStore.route) {
    router.replace(prefStore.route);
  }

  // switch language
  watch(() => prefStore.language, switchLanguage);
  switchLanguage(prefStore.language);

  // dump instance options
  watch(
    () => appStore.selectedInstanceData?.options,
    async () => {
      if (!appStore.selectedInstanceData) return;
      const instance = appStore.selectedInstanceData;
      const dbPath = await join(instance.path, "Database.tdb");
      await backend.saveOptions(dbPath, instance.options);
    },
    { deep: true }
  );
};
