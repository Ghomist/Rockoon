import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { join } from "@tauri-apps/api/path";

/** Launch the Ballance Player.exe for the selected instance. */
export async function launchInstance(options?: {
  /** 额外命令行参数（TAS 编辑器用它给游戏定分辨率：`-w 1024 -h 768`） */
  args?: string[];
  /** 不因为「启动时隐藏主窗口」这个偏好把主窗口藏起来（TAS 编辑器要一直显示） */
  keepMainWindowVisible?: boolean;
  /** 把游戏提到「高」优先级：TAS 回放时别被编辑器（WebView2）抢 CPU 掉帧 */
  highPriority?: boolean;
  /** 额外环境变量（TAS 编辑器用 `ROCKOON_TAS_FPS` 让 RockoonIO 打开回放调速） */
  env?: Record<string, string>;
}): Promise<number | undefined> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) return undefined;
  const cwd = await join(instance.path, "Bin");
  const bin = await join(cwd, "Player.exe");
  const pid = await backend.execute(
    cwd,
    bin,
    options?.env,
    options?.args,
    options?.highPriority
  );
  if (
    !options?.keepMainWindowVisible &&
    usePrefStore.getState().hideWinWhenLaunch
  )
    await backend.hideWindow();
  useAppStore.setState({
    runningInstancePid: pid,
    runningInstancePath: instance.path,
    runningInstanceTimestamp: Date.now()
  });
  return pid;
}

/** Launch the game with a specific map (passed via env). */
export async function launchMap(mapAbsolutePath: string): Promise<void> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) return;
  const cwd = await join(instance.path, "Bin");
  const bin = await join(cwd, "Player.exe");
  const pid = await backend.execute(cwd, bin, {
    ROCKOON_STARTUP: mapAbsolutePath,
    ROCKOON_MAP_ONLY: usePrefStore.getState().mapOnlyMode ? "1" : "0",
    // 0 = 随机 1~13；由 mod 侧读取并传给 MapLoader
    ROCKOON_LEVEL_SLOT: String(usePrefStore.getState().levelSlot ?? 0)
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
