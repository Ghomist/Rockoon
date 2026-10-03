/** 天空盒包里 `Sky_X_<方位>.bmp` 中的 X 是**占位符**：安装时会被替换成目标关卡的
 *  字母（原版 1→L 2→E 3→A 4/13→F 5→C 6→H 7→D 8→G 9→K 10→B 11→J 12→I；M 是社区
 *  "分离第 13 关" 补丁用的）。保持 "X" 则不替换，只给自制地图读的那个槽位。 */
type SkyLetter =
  | "X"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M";

/** BRP manifest — mirrors the snake_case field names defined in the BRP spec. */
type BrpManifest = {
  manifest_version: number;
  category: "map" | "bmod" | "bmodp" | "sound" | "sky" | "texture" | "x-patch";
  name?: string;
  author?: string;
  authors?: string[];
  description?: string;
  dependencies?: string[];
};

/** Result of a successful BRP validation (no install). */
type BrpInfo = {
  manifest: BrpManifest;
  /** First-level entries inside content/ (file or directory names). */
  contentEntries: string[];
  /** All files inside content/, as forward-slash relative paths. */
  contentFiles: string[];
};

/** Result of a successful BRP import (validate + install). */
type BrpImportResult = {
  manifest: BrpManifest;
  /** Absolute installed file paths on disk. */
  installedPaths: string[];
  /** Human-readable target (e.g. `ModLoader/Maps/`). */
  targetDescription: string;
};

/** Progress event payload from async BRP import. */
type BrpImportProgressEvent = {
  id: string;
  phase: "downloading" | "importing";
  percent: number;
  downloaded: number;
  total: number;
};

/** Completion event payload from async BRP import. */
type BrpImportCompleteEvent = {
  id: string;
  success: boolean;
  error?: string;
  manifest?: BrpImportResult;
};
