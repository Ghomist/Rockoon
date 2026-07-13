import { invoke } from "@tauri-apps/api/core";

import { dumpBallanceLaunchConfig, parseBallanceLaunchConfig } from "./utils";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

type SkyboxFile = {
  path: string;
  direction: string;
};

export type SkyboxAnalysisResult = {
  files: SkyboxFile[];
  directions: string[];
};

const common = {
  log: (level: LogLevel, msg: string) => invoke("log", { level, msg }),
  hideWindow: () => invoke("hide_window"),
  showWindow: () => invoke("show_window"),
  toggleWindow: () => invoke("toggle_window"),
  openDevtools: () => invoke("open_devtools")
};

const ballance = {
  readOptions: (path: string) =>
    invoke<BallanceOptions>("read_options", { path }),
  saveOptions: (path: string, options: BallanceOptions) =>
    invoke<undefined>("save_options", { options, path }),
  readLaunchConfig: async (path: string): Promise<BallanceLaunchConfig> => {
    const rawConfig = await invoke<RawLaunchConfig>("read_launch_config", {
      path
    });
    return parseBallanceLaunchConfig(rawConfig);
  },
  saveLaunchConfig: async (path: string, config: BallanceLaunchConfig) => {
    const rawConfig = dumpBallanceLaunchConfig(config);
    await invoke<undefined>("save_launch_config", { config: rawConfig, path });
  },
  readModConfig: (path: string) =>
    invoke<ModConfig>("read_mod_config", { path }),
  saveModConfig: (path: string, config: ModConfig) =>
    invoke<undefined>("save_mod_config", { config, path })
};

const fs = {
  openInExplorer: (path: string) =>
    invoke<undefined>("open_in_explorer", { path }),
  open: (path: string) => invoke<undefined>("open", { path }),
  exists: (file: string) => invoke<boolean>("exists", { path: file }),
  size: (file: string) => invoke<number>("size", { path: file }),
  list: (dir: string, exts: string[]) =>
    invoke<ManagedFile[]>("list", { path: dir, exts }),
  listDirs: (dir: string) => invoke<string[]>("list_dirs", { path: dir }),
  copy: (from: string, to: string) => invoke<undefined>("copy", { from, to }),
  rename: (from: string, to: string) =>
    invoke<undefined>("rename", { from, to }),
  mkdir: (dir: string) => invoke<undefined>("mkdir", { path: dir }),
  delete: (file: string) => invoke<undefined>("delete", { path: file }),
  remove_dir: (dir: string) => invoke<undefined>("remove_dir", { path: dir }),
  disable: (dir: string, fileName: string) =>
    invoke<undefined>("disable", { path: dir, fileName }),
  enable: (dir: string, fileName: string) =>
    invoke<undefined>("enable", { path: dir, fileName }),
  unzip: (zipPath: string, outputDir: string) =>
    invoke<undefined>("unzip", { zipPath, outputDir }),
  analyzeSkyboxFiles: (dirPath: string) =>
    invoke<SkyboxAnalysisResult>("analyze_skybox_files", { dirPath }),
  getCommonDirs: () => invoke<string[]>("get_common_dirs"),
  getTempDir: () => invoke<string>("get_temp_dir"),
  installRockoonMod: (path: string) =>
    invoke<undefined>("install_rockoon_mod", { path }),
  downloadFile: (url: string, savePath: string) =>
    invoke<undefined>("download_file", { url, savePath }),
  writeFile: (path: string, data: number[]) =>
    invoke<undefined>("write_file", { path, data }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path: string, content: string) =>
    invoke<undefined>("write_text_file", { path, content }),
  // BRP (Ballance Resource Package)
  validateBrp: (archivePath: string, instancePath: string) =>
    invoke<BrpInfo>("validate_brp", { archivePath, instancePath }),
  importBrp: (archivePath: string, instancePath: string) =>
    invoke<BrpImportResult>("import_brp", { archivePath, instancePath }),
  importBrpFromUrl: (url: string, instancePath: string) =>
    invoke<BrpImportResult>("import_brp_from_url", { url, instancePath })
};

const process = {
  execute: (cwd: string, bin: string, env?: Record<string, string>) =>
    invoke<number>("execute", { cwd, bin, env }),
  kill: (pid: number) => invoke<undefined>("kill", { pid }),
  check: (pid: number) => invoke<boolean>("check", { pid })
};

export default {
  ...common,
  ...ballance,
  ...fs,
  ...process
};
