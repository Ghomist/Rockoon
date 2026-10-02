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
