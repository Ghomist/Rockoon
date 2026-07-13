import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { join } from "@tauri-apps/api/path";

/** Launch the Ballance Player.exe for the selected instance. */
export async function launchInstance(): Promise<void> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) return;
  const cwd = await join(instance.path, "Bin");
  const bin = await join(cwd, "Player.exe");
  const pid = await backend.execute(cwd, bin);
  if (usePrefStore.getState().hideWinWhenLaunch) await backend.hideWindow();
  useAppStore.setState({
    runningInstancePid: pid,
    runningInstancePath: instance.path,
    runningInstanceTimestamp: Date.now()
  });
}

/** Launch the game with a specific map (passed via env). */
export async function launchMap(mapAbsolutePath: string): Promise<void> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) return;
  const cwd = await join(instance.path, "Bin");
  const bin = await join(cwd, "Player.exe");
  const pid = await backend.execute(cwd, bin, {
    ROCKOON_STARTUP: mapAbsolutePath,
    ROCKOON_MAP_ONLY: usePrefStore.getState().mapOnlyMode ? "1" : "0"
  });
  if (usePrefStore.getState().hideWinWhenLaunch) await backend.hideWindow();
  useAppStore.setState({
    runningInstancePid: pid,
    runningInstancePath: instance.path,
    runningInstanceTimestamp: Date.now()
  });
}

/** Kill the currently running instance. */
export async function killInstance(): Promise<void> {
  const app = useAppStore.getState();
  if (!app.runningInstancePid) return;
  await backend.kill(app.runningInstancePid);
  await backend.showWindow();
  app.updateInstanceRunningTime();
  useAppStore.setState({
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0
  });
}

/** Returns true if still running, false if exited (clears state on exit). */
export async function checkRunningInstance(): Promise<boolean> {
  const app = useAppStore.getState();
  if (!app.runningInstancePid) return false;

  const exists = await backend.check(app.runningInstancePid);
  if (!exists) {
    await backend.showWindow();
    app.updateInstanceRunningTime();
    useAppStore.setState({
      runningInstancePid: undefined,
      runningInstancePath: undefined,
      runningInstanceTimestamp: 0
    });
    return false;
  }
  return true;
}
