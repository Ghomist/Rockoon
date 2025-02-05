type PageId =
  | "home"
  | "tools"
  | "settings"
  | "instances"
  | "download"
  | "wiki"
  | "help";
type AppStore = {
  /** 当前页面 */
  page: PageId;

  /** 当前选中的实例 */
  selected?: BallanceInstance;

  /** 当前运行的实例 ID */
  runningInstance?: number;

  /** 消息队列 */
  messageQueue: Message[];
};
type Message = {
  id: number;
  type: HintType;
  message: string;
};

type ThemeId = "blue" | "red" | "green" | "pink" | "gray";
type PreferenceStore = {
  /** 最近一次启动的实例路径 */
  recent?: string;

  /** 启动后隐藏启动器窗口 */
  hideWinWhenLaunch: boolean;

  /** 退出启动器时关闭运行中的实例 */
  killInstanceWhenExit: boolean;

  /** 重置高分榜时的默认玩家名称 */
  highscoreDefaultPlayer: string;

  /** 主题 */
  theme: ThemeId;

  /** 是否启用背景视频 */
  enableBgv: boolean;

  /** 背景模糊 */
  backgroundBlur: number;

  /** 背景遮罩透明度 */
  maskOpacity: number;
};

type FileStore = {
  instances: {
    path: string;
    name: string;
  }[];
};
type BallanceInstanceStore = FileStore["instances"][number];
