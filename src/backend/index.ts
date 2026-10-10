import { invoke } from "@tauri-apps/api/core";

import { dumpBallanceLaunchConfig, parseBallanceLaunchConfig } from "./utils";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** `game_window_info` 的返回：当前有没有游戏窗口被嵌进来。 */
export type GameWindowInfo = {
  attached: boolean;
  pid: number;
  hwnd: number;
  focused: boolean;
  /** 可交互（鼠标键盘交给游戏）；false = 只看不碰（点击穿透、不抢前台） */
  interactive: boolean;
  rect: [number, number, number, number];
};

/** `game_frame_limit` 的返回：TAS 回放调速槽的当前状态。 */
export type GameFrameLimit = {
  /** 目标帧率（<= 0 = 不限速） */
  targetFps: number;
  /** 游戏里实测的逻辑帧率（约每 0.5 秒更新） */
  measuredFps: number;
};

type SkyboxFile = {
  path: string;
  direction: string;
};

export type SkyboxAnalysisResult = {
  files: SkyboxFile[];
  directions: string[];
};

const common = {
  log: (level: LogLevel, msg: string) => invoke("log", { level, msg }),
  hideWindow: () => invoke("hide_window"),
  showWindow: () => invoke("show_window"),
  toggleWindow: () => invoke("toggle_window"),
  openDevtools: () => invoke("open_devtools")
};

const ballance = {
  readOptions: (path: string) =>
    invoke<BallanceOptions>("read_options", { path }),
  saveOptions: (path: string, options: BallanceOptions) =>
    invoke<undefined>("save_options", { options, path }),
  readLaunchConfig: async (path: string): Promise<BallanceLaunchConfig> => {
    const rawConfig = await invoke<RawLaunchConfig>("read_launch_config", {
      path
    });
    return parseBallanceLaunchConfig(rawConfig);
  },
  saveLaunchConfig: async (path: string, config: BallanceLaunchConfig) => {
    const rawConfig = dumpBallanceLaunchConfig(config);
    await invoke<undefined>("save_launch_config", { config: rawConfig, path });
  },
  readModConfig: (path: string) =>
    invoke<ModConfig>("read_mod_config", { path }),
  saveModConfig: (path: string, config: ModConfig) =>
    invoke<undefined>("save_mod_config", { config, path })
};

const fs = {
  openInExplorer: (path: string) =>
    invoke<undefined>("open_in_explorer", { path }),
  open: (path: string) => invoke<undefined>("open", { path }),
  exists: (file: string) => invoke<boolean>("exists", { path: file }),
  size: (file: string) => invoke<number>("size", { path: file }),
  list: (dir: string, exts: string[]) =>
    invoke<ManagedFile[]>("list", { path: dir, exts }),
  listDirs: (dir: string) => invoke<string[]>("list_dirs", { path: dir }),
  copy: (from: string, to: string) => invoke<undefined>("copy", { from, to }),
  rename: (from: string, to: string) =>
    invoke<undefined>("rename", { from, to }),
  mkdir: (dir: string) => invoke<undefined>("mkdir", { path: dir }),
  delete: (file: string) => invoke<undefined>("delete", { path: file }),
  remove_dir: (dir: string) => invoke<undefined>("remove_dir", { path: dir }),
  disable: (dir: string, fileName: string) =>
    invoke<undefined>("disable", { path: dir, fileName }),
  enable: (dir: string, fileName: string) =>
    invoke<undefined>("enable", { path: dir, fileName }),
  unzip: (zipPath: string, outputDir: string) =>
    invoke<undefined>("unzip", { zipPath, outputDir }),
  analyzeSkyboxFiles: (dirPath: string) =>
    invoke<SkyboxAnalysisResult>("analyze_skybox_files", { dirPath }),
  getCommonDirs: () => invoke<string[]>("get_common_dirs"),
  getTempDir: () => invoke<string>("get_temp_dir"),
  installRockoonMod: (path: string) =>
    invoke<undefined>("install_rockoon_mod", { path }),
  writeFile: (path: string, data: number[]) =>
    invoke<undefined>("write_file", { path, data }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  /** 读二进制文件（TAS 编辑器用；返回字节数组） */
  readFile: (path: string) => invoke<number[]>("read_file", { path }),
  /** TGA 等浏览器显示不了的贴图 → PNG 缓存文件路径，配 `convertFileSrc()` 使用 */
  convertTexture: (path: string) => invoke<string>("convert_texture", { path }),
  writeTextFile: (path: string, content: string) =>
    invoke<undefined>("write_text_file", { path, content }),
  // BRP (Ballance Resource Package)
  validateBrp: (archivePath: string, instancePath: string) =>
    invoke<BrpInfo>("validate_brp", { archivePath, instancePath }),
  importBrp: (
    archivePath: string,
    instancePath: string,
    skyLetter?: SkyLetter
  ) =>
    invoke<BrpImportResult>("import_brp", {
      archivePath,
      instancePath,
      skyLetter
    }),
  /** Start async BRP download + install. Returns a download ID immediately. */
  startBrpImport: (url: string, instancePath: string, skyLetter?: SkyLetter) =>
    invoke<string>("start_brp_import", { url, instancePath, skyLetter }),
  /** Cancel an in-progress BRP import by ID. */
  cancelBrpImport: (id: string) =>
    invoke<undefined>("cancel_brp_import", { id })
};

const process = {
  /** `args` 是额外的命令行参数（TAS 编辑器用它给游戏定分辨率）；
   * `highPriority` 把游戏提到「高」优先级（TAS 回放防被编辑器抢 CPU） */
  execute: (
    cwd: string,
    bin: string,
    env?: Record<string, string>,
    args?: string[],
    highPriority?: boolean
  ) => invoke<number>("execute", { cwd, bin, env, args, highPriority }),
  kill: (pid: number) => invoke<undefined>("kill", { pid }),
  check: (pid: number) => invoke<boolean>("check", { pid }),
  /** 按映像名列出在跑的进程 pid（如 `Player.exe`；Ballance 不支持多开，启动前要确认没有残留） */
  findProcesses: (image: string) =>
    invoke<number[]>("find_processes", { image })
};

/**
 * 把 Ballance 的主窗口以「顶层窗口 + owner」摆到当前窗口里的一块区域（见 embed.rs）。
 * 坐标都是**宿主窗口客户区的物理像素**（前端 CSS px × devicePixelRatio）。
 */
const embed = {
  attachGameWindow: (
    pid: number,
    x: number,
    y: number,
    width: number,
    height: number
  ) => invoke<number>("attach_game_window", { pid, x, y, width, height }),
  moveGameWindow: (x: number, y: number, width: number, height: number) =>
    invoke<undefined>("move_game_window", { x, y, width, height }),
  detachGameWindow: () => invoke<undefined>("detach_game_window"),
  gameWindowInfo: () => invoke<GameWindowInfo>("game_window_info"),
  /** true = 鼠标键盘交给游戏；false = 只看不碰（默认，鼠标不会被游戏吃掉） */
  setGameWindowInteractive: (interactive: boolean) =>
    invoke<undefined>("set_game_window_interactive", { interactive }),
  /** TAS 回放调速：写目标帧率（<= 0 = 不限速）。游戏还没建好槽时会报错，过会儿重试 */
  setGameFrameLimit: (pid: number, fps: number) =>
    invoke<undefined>("set_game_frame_limit", { pid, fps }),
  gameFrameLimit: (pid: number) =>
    invoke<GameFrameLimit>("game_frame_limit", { pid })
};

const game = {
  /** 从下载站下载原版游戏并解压到目标文件夹；进度与结果走 game-install:* 事件 */
  startInstall: (url: string, targetDir: string) =>
    invoke<string>("start_game_install", { url, targetDir }),
  cancelInstall: (id: string) =>
    invoke<undefined>("cancel_game_install", { id })
};

const patches = {
  /**
   * 从下载站下载补丁包（BML / BML+ / 新 Player）并解压到目标文件夹。
   * 与原版安装共用 game-install:* 事件，取消也走 cancelInstall。
   */
  install: (url: string, targetDir: string, stripTopLevel: boolean) =>
    invoke<string>("start_patch_install", { url, targetDir, stripTopLevel })
};

export default {
  ...common,
  ...ballance,
  ...fs,
  ...process,
  ...embed,
  ...game,
  patches
};
