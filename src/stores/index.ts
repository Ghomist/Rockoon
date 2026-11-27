import backend from "@/backend";
import { switchLanguage } from "@/i18n";
import { withDebounce } from "@/utils/common";
import storage from "@/utils/storage";
import { join } from "@tauri-apps/api/path";
import { useAppStore } from "./app";
import { PREF_STORE_KEY, usePrefStore } from "./pref";
import { useProfilesStore } from "./profiles";
import { initDownloadProxy } from "@/services/network";

// ── 选项写回 Database.tdb ───────────────────────────────────
// 拖滑块 / 连点开关时选项会连着变好几次：合并成一次写（防抖），
// 并且写入一个接一个排队 —— 否则几次异步写入可能乱序完成，旧值盖掉新值。

const OPTIONS_SAVE_DELAY = 300;

let pendingOptions: { instancePath: string; options: BallanceOptions } | null =
  null;
let optionsTimer: number | undefined;
let optionsChain: Promise<void> = Promise.resolve();

/** 立刻把还没写的选项写进 Database.tdb（启动游戏前调用，保证游戏读到的是最新的）。 */
export function flushOptionsSave(): Promise<void> {
  window.clearTimeout(optionsTimer);
  optionsTimer = undefined;
  const job = pendingOptions;
  pendingOptions = null;
  if (job) {
    optionsChain = optionsChain.then(async () => {
      try {
        const dbPath = await join(job.instancePath, "Database.tdb");
        await backend.saveOptions(dbPath, job.options);
      } catch (e) {
        // 实例可能已经被移走了；记一笔，不打断后续写入
        console.warn("Failed to save options:", e);
      }
    });
  }
  return optionsChain;
}

function scheduleOptionsSave(instancePath: string, options: BallanceOptions) {
  // 换了实例：先把上一个实例没写完的写掉
  if (pendingOptions && pendingOptions.instancePath !== instancePath)
    void flushOptionsSave();
  pendingOptions = { instancePath, options };
  window.clearTimeout(optionsTimer);
  optionsTimer = window.setTimeout(
    () => void flushOptionsSave(),
    OPTIONS_SAVE_DELAY
  );
}

/**
 * Wire up store subscriptions and load initial state.
 * Call once on app startup. Router restoration is left to the App component
 * (needs access to the router instance).
 */
export const initStores = async (): Promise<void> => {
  try {
    const prefStore = usePrefStore.getState();

    // 1. Persist pref to localStorage (debounced).
    usePrefStore.subscribe(withDebounce(() => usePrefStore.getState().save()));

    // 1b. 下载代理：Rust 那边只存内存，启动时推一次，之后跟着 pref 变。
    initDownloadProxy();

    // 2. Load single instance + profiles.
    if (prefStore.instancePath) {
      const ok = await useAppStore
        .getState()
        .loadInstance(prefStore.instancePath);
      if (ok) {
        await useProfilesStore.getState().load();
      }
    }

    // 3. Sync initial language + follow changes.
    syncLanguage();

    // 4. selectedInstanceData.options changes → write back to Database.tdb.
    //    applyState produces a new options object, so reference equality is enough.
    useAppStore.subscribe(
      s => s.selectedInstanceData?.options,
      o => {
        const instance = useAppStore.getState().selectedInstanceData;
        if (!instance || !o) return;
        scheduleOptionsSave(instance.path, o);
      }
    );

    // 关窗口前把还没写的选项写掉
    window.addEventListener("beforeunload", () => void flushOptionsSave());
  } finally {
    // 不管加载成没成，都要告诉界面「加载结束了」—— 否则没实例时会一直停在开屏，
    // 有实例时又会在加载完前先闪一下「选实例」的引导页。
    useAppStore.getState().markBooted();
  }
};

/**
 * TAS 窗口的初始化：只跟着主窗口的偏好走，自己**不写** pref、不写 Database.tdb。
 *
 * 两个 webview 共用 localStorage：如果 TAS 窗口也挂上 pref 持久化，它手里那份启动时的旧快照
 * 会在任意一次 setState 后整份写回，把主窗口期间改过的东西（游戏时长、实例、主题……）盖掉。
 */
export const initTasWindowStores = (): void => {
  syncLanguage();
  window.addEventListener("storage", e => {
    if (e.key !== PREF_STORE_KEY || !e.newValue) return;
    try {
      // 走 storage.get：它会把 ISO 字符串还原成 Date，和启动时读到的格式一致
      usePrefStore.setState(storage.get<PreferenceStore>(PREF_STORE_KEY));
    } catch {
      // ignore: 半截写入 / 手改坏的 localStorage
    }
  });
};

function syncLanguage() {
  switchLanguage(usePrefStore.getState().language);
  // Selector form needs subscribeWithSelector.
  usePrefStore.subscribe(
    s => s.language,
    lang => switchLanguage(lang)
  );
}
