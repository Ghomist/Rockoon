type AppStore = {
  /** 当前选中的实例信息 */
  selectedInstanceData?: InstanceData;

  /** 当前运行的实例路径 */
  runningInstancePath?: string;

  /** 当前运行的实例 PID */
  runningInstancePid?: number;

  /** 当前运行的实例启动时间 */
  runningInstanceTimestamp: number;
};
type Message = {
  id: number;
  message: string;
};

type ThemeId = "blue" | "red" | "green" | "pink" | "gray" | "custom";
type PreferenceStore = {
  /** 唯一实例（Ballance 安装目录）路径 */
  instancePath?: string;

  /** 总游玩时间（单位：秒），单一实例全局累计 */
  playtime: number;

  /** 启动后隐藏启动器窗口 */
  hideWinWhenLaunch: boolean;

  /** 退出启动器时关闭运行中的实例 */
  killInstanceWhenExit: boolean;

  /** 重置高分榜时的默认玩家名称 */
  highscoreDefaultPlayer: string;

  /** 是否启用背景视频 */
  enableBgv: boolean;

  /** 背景模糊 */
  backgroundBlur: number;

  /** 背景遮罩透明度 */
  maskOpacity: number;

  /** 自定义背景图 */
  backgroundImage?: string;

  /** 下载站索引过期时间（分钟） */
  indexExpireTime: number;

  /** 语言 */
  language: string;

  /** 主题 */
  theme: "light" | "dark" | "auto";

  /** 当前路由（记住上次打开的页面） */
  route: string;

  /** 是否居中窗口 */
  centerWindow: boolean;

  /** 是否显示欢迎语 */
  showWelcome: boolean;

  /** 仅地图模式：直接启动地图时退出地图自动退出游戏 */
  mapOnlyMode: boolean;

  /** 是否在游戏内显示 MOTD */
  ingameMotd: boolean;

  /** 游戏内 MOTD 内容 */
  ingameMotdContent: string;
};

type ProfileStore = {
  /** .rockoon/profiles.json 的内容（配置档索引 + 当前 profile） */
  index: ProfileIndex;
};
