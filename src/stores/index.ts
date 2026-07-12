import backend from "@/backend";
import { switchLanguage } from "@/i18n";
import { router } from "@/routers";
import { withDebounce } from "@/utils/common";
import { join } from "@tauri-apps/api/path";
import { watch } from "vue";
import { useAppStore } from "./app";
import { usePrefStore } from "./pref";
import { useProfilesStore } from "./profiles";

export const initStores = async () => {
  const appStore = useAppStore();
  const prefStore = usePrefStore();
  const profilesStore = useProfilesStore();

  // pref 自动保存（含 instancePath、playtime 等）
  prefStore.$subscribe(withDebounce(prefStore.save));

  // 加载单一实例 + 配置档
  if (prefStore.instancePath) {
    await appStore.loadInstance(prefStore.instancePath);
    if (appStore.selectedInstanceData) {
      await profilesStore.load();
    }
  }

  // 恢复上次路由（未配置实例时由 App.vue 显示引导页）
  if (appStore.selectedInstanceData && prefStore.route) {
    router.replace(prefStore.route);
  }

  // 语言切换
  watch(() => prefStore.language, switchLanguage);
  switchLanguage(prefStore.language);

  // 实例选项深监听 → 自动写回 Database.tdb
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
