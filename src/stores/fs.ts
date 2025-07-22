import fs from "@/api/fs";
import { checkBallanceFolder } from "@/utils/instance";
import storage from "@/utils/storage";
import { join, sep } from "@tauri-apps/api/path";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useAppStore } from "./app";

const FILE_STORE_KEY = "rockoon-file";

export const useFileStore = defineStore(FILE_STORE_KEY, {
  state: () =>
    storage.getWithDefault<FileStore>(FILE_STORE_KEY, {
      instances: []
    }),
  actions: {
    save() {
      storage.set(FILE_STORE_KEY, this.$state);
    },
    async addInstance(path: string, name?: string) {
      if (this.instances.some(x => x.path === path)) return null;
      name = name ?? path.split(sep()).pop() ?? "Ballance";
      const instance = await checkBallanceFolder(path);
      if (instance) {
        this.instances.push({ name, path, playtime: 0 });
      }
      return instance;
    },
    removeInstance(path: string) {
      const index = this.instances.findIndex(x => x.path === path);
      if (index !== -1) {
        this.instances.splice(index, 1);
        useAppStore().selected = undefined;
      }
    },
    async scanInstances(dir: string, depth: number) {
      let cnt = 0;
      if (depth) {
        try {
          const dirs = await fs.listDirs(dir);
          for (const dir of dirs) {
            const instance = await this.addInstance(dir);
            if (instance) cnt++;
            else cnt += await this.scanInstances(dir, depth - 1);
          }
        } catch {
          // ignore
        }
      }
      return cnt;
    },
    async scanPossibleInstances() {
      let cnt = 0;
      const dirs = await fs.getCommonDirs();
      for (const dir of dirs) {
        cnt += await this.scanInstances(dir, 2);
      }
      return cnt;
    },
    async getInstanceFiles(
      path: string,
      folderType: "map" | "mod" | "modCfg" | "bb"
    ) {
      return await fs
        .list(
          await {
            map: join(path, "ModLoader", "Maps"),
            mod: join(path, "ModLoader", "Mods"),
            modCfg: join(path, "ModLoader", "Configs"),
            bb: join(path, "BuildingBlocks")
          }[folderType],
          {
            map: ["nmo"],
            mod: ["bmod", "bmodp", "zip"],
            modCfg: ["cfg"],
            bb: ["dll"]
          }[folderType]
        )
        .catch(() => []);
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFileStore, import.meta.hot));
}
