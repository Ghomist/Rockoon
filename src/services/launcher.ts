import backend, { type VanillaFileState } from "@/backend";
import { askVanillaModified } from "@/components/VanillaGuard";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { join } from "@tauri-apps/api/path";

/**
 * 启动前校验 `3D Entities` 里的原版 nmo：被换过 / 缺失就弹窗问用户。
 * 返回 true = 可以继续启动。校验本身失败（读不了目录等）不拦启动。
 */
async function passVanillaCheck(instancePath: string): Promise<boolean> {
  let mismatched: VanillaFileState[];
  try {
    mismatched = await backend.vanilla.verifyLevels(instancePath);
  } catch (e) {
    console.warn("Vanilla level check failed:", e);
    return true;
  }
  if (mismatched.length === 0) return true;
  // “去补丁页恢复”由对话框自己跳转，这里只管发不启动
  return (await askVanillaModified(mismatched.map(f => f.path))) === "launch";
}

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
  // 原版关卡 / 组件被换过就提醒一下：不再是原版游戏了，玩家容易懵
  if (!(await passVanillaCheck(instance.path))) return undefined;
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
