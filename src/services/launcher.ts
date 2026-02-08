import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { join } from "@tauri-apps/api/path";

export const useLauncherService = () => {
  const appStore = useAppStore();
  const prefStore = usePrefStore();

  async function launchInstance(instance: Instance) {
    const cwd = await join(instance.path, "Bin");
    const bin = await join(cwd, "Player.exe");
    const pid = await backend.execute(cwd, bin);
    if (prefStore.hideWinWhenLaunch) await backend.hideWindow();
    appStore.runningInstancePid = pid;
    appStore.runningInstancePath = instance.path;
    appStore.runningInstanceTimestamp = Date.now();
  }

  async function killInstance() {
    if (!appStore.runningInstancePid) return;

    await backend.kill(appStore.runningInstancePid);
    await backend.showWindow();
    appStore.updateInstanceRunningTime();
    appStore.runningInstancePid = undefined;
    appStore.runningInstancePath = undefined;
    appStore.runningInstanceTimestamp = 0;
  }

  async function checkRunningInstance() {
    if (!appStore.runningInstancePid) return false;

    const exists = await backend.check(appStore.runningInstancePid);
    if (!exists) {
      await backend.showWindow();
      appStore.updateInstanceRunningTime();
      appStore.runningInstancePid = undefined;
      appStore.runningInstancePath = undefined;
      appStore.runningInstanceTimestamp = 0;
      return false;
    }
    return true;
  }

  return { checkRunningInstance, killInstance, launchInstance };
};
