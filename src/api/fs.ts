import { invoke } from "@tauri-apps/api/core";

export default {
  exists: (file: string) => invoke<boolean>("exists", { path: file }),
  size: (file: string) => invoke<number>("size", { path: file }),
  list: (dir: string, exts: string[]) =>
    invoke<ManagedFile[]>("list", { path: dir, exts }),
  listDirs: (dir: string) => invoke<string[]>("list_dirs", { path: dir }),
  copy: (from: string, to: string) => invoke<void>("copy", { from, to }),
  mkdir: (dir: string) => invoke<void>("mkdir", { path: dir }),
  delete: (file: string) => invoke<void>("delete", { path: file }),
  disable: (dir: string, fileName: string) =>
    invoke<void>("disable", { path: dir, fileName }),
  enable: (dir: string, fileName: string) =>
    invoke<void>("enable", { path: dir, fileName }),
  unzip: (zipPath: string, outputDir: string) =>
    invoke<void>("unzip", { zipPath, outputDir }),
  getCommonDirs: () => invoke<string[]>("get_common_dirs")
};
