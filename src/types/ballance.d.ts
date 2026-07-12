type InstanceData = {
  path: string;
  playerType: "original" | "new";
  modLoaderType: "none" | "bml" | "bmlp";
  modLoaderEnabled: boolean;
  options: BallanceOptions;
};

type RawLaunchConfig = {
  [category: string]: {
    [key: string]: string;
  };
};

type BallanceOptions = {
  volume: number;
  syncToScreen: boolean;
  keyForward: number;
  keyBackward: number;
  keyLeft: number;
  keyRight: number;
  keyRotateCam: number;
  keyLiftCam: number;
  invertCamRotation: boolean;
  cloudLayer: boolean;
  lastPlayer: string;
  levelLock: boolean[];
  highscores: { player: string; score: number }[][];
};

type BallanceLaunchConfig = {
  Game: {
    Language: number;
    SkipOpening: boolean;
    UnlockFramerate: boolean;
    UnlockWidescreen: boolean;
    UnlockHighResolution: boolean;
    ApplyHotfix: boolean;
    Debug: boolean;
    Rookie: boolean;
  };
  Window: {
    ClipCursor: boolean;
    Borderless: boolean;
    ChildWindowRendering: boolean;
    AlwaysHandleInput: boolean;
    X: number;
    Y: number;
  };
  Graphics: {
    Width: number;
    Height: number;
    FullScreen: boolean;
    Driver: number;
    DisableDithering: boolean;
    DisableSpecular: boolean;
    DisableMipmap: boolean;
    DisablePerspectiveCorrection: boolean;
    ForceLinearFog: boolean;
    ForceSoftware: boolean;
    DisableFilter: boolean;
    EnsureVertexShader: boolean;
    UseIndexBuffers: boolean;
    SortTransparentObjects: boolean;
    TextureCacheManagement: boolean;
    EnableDebugMode: boolean;
    EnableScreenDump: boolean;
    Antialias: number;
    VertexCache: number;
    BitsPerPixel: number;
    SpriteVideoFormat: string;
    TextureVideoFormat: string;
  };
  Startup: {
    LogMode: boolean;
    Verbose: boolean;
    ManualSetup: boolean;
  };
};

type BallanceKeyType =
  | "keyForward"
  | "keyBackward"
  | "keyLeft"
  | "keyRight"
  | "keyRotateCam"
  | "keyLiftCam";

type ModConfigEntry = {
  name: string;
  description: string;
  datatype: string;
  value: string;
};

type ModConfig = {
  categories: {
    [category: string]: string;
  };
  entries: {
    [category: string]: ModConfigEntry[];
  };
};

type KeySchema = {
  id: number;
  name: string;
  display?: string;
  width?: number;
  disabled?: boolean;
};

/** Profile 中捕获的游戏选项子集（不含成绩/进度，那些全局共享） */
type ProfileGameOptions = Pick<
  BallanceOptions,
  | "volume"
  | "syncToScreen"
  | "keyForward"
  | "keyBackward"
  | "keyLeft"
  | "keyRight"
  | "keyRotateCam"
  | "keyLiftCam"
  | "invertCamRotation"
  | "cloudLayer"
  | "lastPlayer"
>;

/** 一个配置档：对当前启用状态及相关配置的快照 */
type Profile = {
  id: string;
  name: string;
  createdAt: number;
  /** 被禁用的逻辑相对路径（相对实例根目录，例如 ModLoader/Maps/foo.nmo） */
  disabledFiles: string[];
  /** 游戏选项子集（成绩/进度不随 profile 切换） */
  gameOptions: ProfileGameOptions;
  /** 启动配置（Bin/Player.ini）；若实例无该文件则为空 */
  launchConfig?: BallanceLaunchConfig;
  /** 各 mod 配置（文件名 → ModConfig） */
  modConfigs: Record<string, ModConfig>;
};

/** .rockoon/profiles.json 的结构 */
type ProfileIndex = {
  profiles: Profile[];
  currentId: string;
};
