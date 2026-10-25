/** 原版游戏安装：与 src-tauri/src/commands/game.rs 的事件负载对齐。 */

type GameInstallPhase = "connecting" | "downloading" | "importing" | "done";

type GameInstallProgress = {
  id: string;
  phase: GameInstallPhase;
  percent: number;
  downloaded: number;
  total: number;
};

type GameInstallComplete = {
  id: string;
  success: boolean;
  error?: string;
  /** 安装成功时的目标文件夹 */
  target?: string;
};

/** 下载站给启动器的元信息（GET /game/info） */
type VanillaGameInfo = {
  available: boolean;
  name: string;
  version: string;
  filename: string;
  size?: number;
  sha256?: string;
  updated_at?: string;
  url?: string;
};

/** Wine 运行时状态（src-tauri/src/commands/wine.rs 的 WineStatus） */
type WineStatus = {
  /** 这个平台要不要 Wine（Windows 上为 false，其余字段无意义） */
  required: boolean;
  /** 自带的 Wine 还没解出来（或是旧版本）时为 false */
  installed: boolean;
  /** builtin = 启动器自带的；custom = 用户指定 */
  source?: "builtin" | "custom";
  path?: string;
  version?: string;
  /** 启动器自带的 Wine 版本（构建时没打包 Wine 为空） */
  bundledVersion?: string;
  /** 前缀已经用当前 Wine 初始化好了（没好的话启动前要先 preparePrefix） */
  prefixReady: boolean;
  prefix?: string;
  /** Apple 芯片上 Rosetta 2 是否可用 */
  rosetta: boolean;
  customPath?: string;
};
