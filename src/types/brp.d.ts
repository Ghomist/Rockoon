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
