type Instance = {
  path: string;
  name: string;
  /** 游玩时间（单位：秒） */
  playtime: number;
};

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

type BallanceResourceFile = {
  id: string; // MD5
  name: string;
  format: string;
  author: string;
  description: string;
  tags: string[];
  publishTime: Date;
};

type BallanceMap = BallanceResourceFile & {
  difficulty: number;
};

type BallanceMapsResponse = {
  maps: BallanceMap[];
};
