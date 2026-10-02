/** 下载站的补丁组件（GET /patches 的 items 项），启动器据此安装。 */

type PatchInstallTarget = "game" | "bin";

type PatchComponent = {
  key: string;
  name: string;
  repo: string;
  homepage: string;
  /** 装到游戏根目录还是游戏根的 Bin 目录 */
  install_target: PatchInstallTarget;
  /** 上游包外层是否多套了一层目录（新 Player 包就是） */
  strip_top_level: boolean;
  /** 装完用来校验的文件（相对安装目录） */
  marker: string;
  package_id: number | null;
  versions: number;
  /** 最新版本号，与上游 GitHub 发布版本（tag）对齐 */
  latest: string;
  latest_at: string | null;
};

/** 单个补丁版本（GET /packages/{id}/versions 的 items 项）
 *
 * 注意：`version` 是文件序号（1、2、3…），用于下载/删除；
 * 展示给用户、与上游 GitHub 对齐的版本号是 `note`（如 v0.3.13）。
 */
type PatchVersion = {
  version: number;
  file_name: string;
  file_size: number;
  note: string | null;
  created_at: string;
  is_current: boolean;
};

/** 补丁安装进度（复用原版游戏安装的事件通道） */
type PatchInstallPhase = "connecting" | "downloading" | "importing" | "done";

type PatchInstallProgress = {
  onPhase: (phase: PatchInstallPhase) => void;
  onPercent: (percent: number) => void;
  onTaskId: (id: string) => void;
};
