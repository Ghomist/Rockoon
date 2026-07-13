import backend from "@/backend";
import { switchLanguage } from "@/i18n";
import { withDebounce } from "@/utils/common";
import { join } from "@tauri-apps/api/path";
import { useAppStore } from "./app";
import { usePrefStore } from "./pref";
import { useProfilesStore } from "./profiles";

/**
 * Wire up store subscriptions and load initial state.
 * Call once on app startup. Router restoration is left to the App component
 * (needs access to the router instance).
 */
export const initStores = async (): Promise<void> => {
  const prefStore = usePrefStore.getState();

  // 1. Persist pref to localStorage (debounced).
  usePrefStore.subscribe(withDebounce(() => usePrefStore.getState().save()));

  // 2. Load single instance + profiles.
  if (prefStore.instancePath) {
    const ok = await useAppStore
      .getState()
      .loadInstance(prefStore.instancePath);
    if (ok) {
      await useProfilesStore.getState().load();
    }
  }

  // 3. Sync initial language.
  switchLanguage(prefStore.language);

  // 4. Subscribe to language changes (selector form needs subscribeWithSelector).
  usePrefStore.subscribe(
    s => s.language,
    lang => switchLanguage(lang)
  );

  // 5. selectedInstanceData.options changes → write back to Database.tdb.
  //    applyState produces a new options object, so reference equality is enough.
  useAppStore.subscribe(
    s => s.selectedInstanceData?.options,
    async o => {
      const instance = useAppStore.getState().selectedInstanceData;
      if (!instance || !o) return;
      try {
        const dbPath = await join(instance.path, "Database.tdb");
        await backend.saveOptions(dbPath, instance.options);
      } catch {
        // ignore: instance may have been torn down
      }
    }
  );
};
