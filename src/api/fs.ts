import { invoke } from "@tauri-apps/api/core";

export default {
  exists: (file: string) => invoke<boolean>("exists", { path: file }),
  size: (file: string) => invoke<number>("size", { path: file }),
  list: (dir: string, exts: string[]) =>
    invoke<ManagedFile[]>("list", { path: dir, exts }),
  delete: (file: string) => invoke<void>("delete", { path: file }),
  disable: (dir: string, fileName: string) =>
    invoke<void>("disable", { path: dir, fileName }),
  enable: (dir: string, fileName: string) =>
    invoke<void>("enable", { path: dir, fileName })
};
