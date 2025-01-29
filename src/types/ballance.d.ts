type BallanceInstance = {
  path: string;
  newPlayer: boolean;
  bmlInstalled: boolean;
  bmlEnabled: boolean;
  bmlpInstalled: boolean;
  bmlpEnabled: boolean;
  options: BallanceOptions;
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
type BallanceKeyType =
  | "keyForward"
  | "keyBackward"
  | "keyLeft"
  | "keyRight"
  | "keyRotateCam"
  | "keyLiftCam";

type NewPlayerConfig = {
  [category: string]: {
    [key: string]: string;
  };
};

type MapOrMod = {
  name: string;
  format: string;
  size: number;
  enabled: boolean;
};
