import backend from "@/backend";
import { useAppStore } from "./app";
import { usePrefStore } from "./pref";
import { join } from "@tauri-apps/api/path";
import { acceptHMRUpdate, defineStore } from "pinia";

const PROFILE_DIR = ".rockoon";
const PROFILE_FILE = "profiles.json";

/** 需要捕获禁用状态的资源目录 + 扩展名 */
const RESOURCE_DIRS: { dir: string; exts: string[] }[] = [
  { dir: "ModLoader/Maps", exts: ["cmo", "nmo"] },
  { dir: "ModLoader/Mods", exts: ["bmod", "bmodp", "zip"] },
  { dir: "BuildingBlocks", exts: ["dll"] }
];
const MODCFG_DIR = "ModLoader/Configs";
const MODCFG_EXTS = ["cfg", "ini"];

const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const profilesFilePath = (instancePath: string) =>
  join(instancePath, PROFILE_DIR, PROFILE_FILE);

const playerIniPath = (instancePath: string) =>
  join(instancePath, "Bin", "Player.ini");

export const useProfilesStore = defineStore("profiles", {
  state: (): ProfileStore => ({
    index: { profiles: [], currentId: "" }
  }),
  getters: {
    profiles: state => state.index.profiles,
    currentProfile: state =>
      state.index.profiles.find(p => p.id === state.index.currentId)
  },
  actions: {
    /** 从磁盘读取 .rockoon/profiles.json；不存在或损坏则创建默认 profile */
    async load() {
      const instancePath = usePrefStore().instancePath;
      if (!instancePath) return;

      const file = await profilesFilePath(instancePath);
      if (await backend.exists(file)) {
        try {
          const text = await backend.readTextFile(file);
          const parsed = JSON.parse(text) as ProfileIndex;
          if (parsed?.profiles?.length) this.index = parsed;
        } catch {
          // 损坏：忽略，下面创建默认
        }
      }

      if (!this.index.profiles.length) {
        await this.ensureDefaultProfile();
      } else if (
        !this.index.profiles.some(p => p.id === this.index.currentId)
      ) {
        this.index.currentId = this.index.profiles[0].id;
      }
    },

    async save() {
      const instancePath = usePrefStore().instancePath;
      if (!instancePath) return;
      await backend.writeTextFile(
        await profilesFilePath(instancePath),
        JSON.stringify(this.index)
      );
    },

    /** 创建一个默认 profile，以当前磁盘状态为快照 */
    async ensureDefaultProfile() {
      const snapshot = await this.captureCurrentState();
      const profile: Profile = {
        id: genId(),
        name: "Default",
        createdAt: Date.now(),
        ...snapshot
      };
      this.index.profiles = [profile];
      this.index.currentId = profile.id;
      await this.save();
    },

    /** 切换 profile：先记录当前磁盘状态到旧 profile，再应用目标 profile */
    async switchProfile(id: string) {
      if (id === this.index.currentId) return;
      const target = this.index.profiles.find(p => p.id === id);
      if (!target) return;

      const outgoing = this.currentProfile;
      if (outgoing) {
        const snapshot = await this.captureCurrentState();
        outgoing.disabledFiles = snapshot.disabledFiles;
        outgoing.gameOptions = snapshot.gameOptions;
        outgoing.launchConfig = snapshot.launchConfig;
        outgoing.modConfigs = snapshot.modConfigs;
      }

      await this.applyState(target);
      this.index.currentId = id;
      await this.save();
    },

    /** 以当前磁盘状态创建新 profile 并设为当前（磁盘不变） */
    async createProfile(name: string) {
      const snapshot = await this.captureCurrentState();
      const profile: Profile = {
        id: genId(),
        name,
        createdAt: Date.now(),
        ...snapshot
      };
      this.index.profiles.push(profile);
      this.index.currentId = profile.id;
      await this.save();
      return profile;
    },

    async deleteProfile(id: string) {
      if (this.index.profiles.length <= 1) return; // 至少保留一个
      const idx = this.index.profiles.findIndex(p => p.id === id);
      if (idx === -1) return;
      this.index.profiles.splice(idx, 1);

      if (this.index.currentId === id) {
        const next = this.index.profiles[0];
        this.index.currentId = next.id;
        await this.applyState(next);
      }
      await this.save();
    },

    async renameProfile(id: string, name: string) {
      const p = this.index.profiles.find(x => x.id === id);
      if (p) {
        p.name = name;
        await this.save();
      }
    },

    /** 捕获当前磁盘状态为 profile 快照（不含 id/name/createdAt） */
    async captureCurrentState() {
      const instancePath = usePrefStore().instancePath!;
      const app = useAppStore();

      const disabledFiles: string[] = [];
      for (const { dir, exts } of RESOURCE_DIRS) {
        const absDir = await join(instancePath, ...dir.split("/"));
        disabledFiles.push(
          ...(await this.enumerateDisabled(absDir, dir, exts))
        );
      }

      const gameOptions = {} as ProfileGameOptions;
      if (app.selectedInstanceData) {
        const o = app.selectedInstanceData.options;
        gameOptions.volume = o.volume;
        gameOptions.syncToScreen = o.syncToScreen;
        gameOptions.keyForward = o.keyForward;
        gameOptions.keyBackward = o.keyBackward;
        gameOptions.keyLeft = o.keyLeft;
        gameOptions.keyRight = o.keyRight;
        gameOptions.keyRotateCam = o.keyRotateCam;
        gameOptions.keyLiftCam = o.keyLiftCam;
        gameOptions.invertCamRotation = o.invertCamRotation;
        gameOptions.cloudLayer = o.cloudLayer;
        gameOptions.lastPlayer = o.lastPlayer;
      }

      let launchConfig: BallanceLaunchConfig | undefined;
      try {
        launchConfig = await backend.readLaunchConfig(
          await playerIniPath(instancePath)
        );
      } catch {
        // 无 Player.ini：留空
      }

      const modConfigs = await this.captureModConfigs(instancePath);

      return { disabledFiles, gameOptions, launchConfig, modConfigs };
    },

    /** 递归枚举某目录下被禁用文件的逻辑相对路径（相对实例根） */
    async enumerateDisabled(
      absDir: string,
      logicalPrefix: string,
      exts: string[]
    ): Promise<string[]> {
      const result: string[] = [];
      let files: ManagedFile[] = [];
      try {
        files = await backend.list(absDir, exts);
      } catch {
        return result;
      }
      for (const f of files) {
        if (f.name.endsWith(".disable")) {
          const logical = f.name.slice(0, -".disable".length);
          result.push(`${logicalPrefix}/${logical}`);
        }
      }

      let dirs: string[] = [];
      try {
        dirs = await backend.listDirs(absDir);
      } catch {}
      for (const d of dirs) {
        const baseName = d.split(/[\\/]/).pop()!;
        result.push(
          ...(await this.enumerateDisabled(
            d,
            `${logicalPrefix}/${baseName}`,
            exts
          ))
        );
      }
      return result;
    },

    async captureModConfigs(
      instancePath: string
    ): Promise<Record<string, ModConfig>> {
      const result: Record<string, ModConfig> = {};
      const cfgDir = await join(instancePath, ...MODCFG_DIR.split("/"));
      let files: ManagedFile[] = [];
      try {
        files = await backend.list(cfgDir, MODCFG_EXTS);
      } catch {
        return result;
      }
      for (const f of files) {
        try {
          result[f.name] = await backend.readModConfig(await join(cfgDir, f.name));
        } catch {
          // 跳过不可读
        }
      }
      return result;
    },

    /** 将某 profile 的状态应用到磁盘 */
    async applyState(profile: Profile) {
      const instancePath = usePrefStore().instancePath!;

      // 1. 同步禁用集合：计算 diff，按需 enable/disable
      const currentDisabled = new Set<string>();
      for (const { dir, exts } of RESOURCE_DIRS) {
        const absDir = await join(instancePath, ...dir.split("/"));
        for (const f of await this.enumerateDisabled(absDir, dir, exts)) {
          currentDisabled.add(f);
        }
      }
      const targetDisabled = new Set(profile.disabledFiles);
      for (const logical of currentDisabled) {
        if (!targetDisabled.has(logical)) await this.toggleFile(logical, true);
      }
      for (const logical of targetDisabled) {
        if (!currentDisabled.has(logical))
          await this.toggleFile(logical, false);
      }

      // 2. 游戏选项：合并设置字段（保留全局的 levelLock/highscores），watcher 持久化
      const app = useAppStore();
      if (app.selectedInstanceData) {
        const o = app.selectedInstanceData.options;
        const g = profile.gameOptions;
        o.volume = g.volume;
        o.syncToScreen = g.syncToScreen;
        o.keyForward = g.keyForward;
        o.keyBackward = g.keyBackward;
        o.keyLeft = g.keyLeft;
        o.keyRight = g.keyRight;
        o.keyRotateCam = g.keyRotateCam;
        o.keyLiftCam = g.keyLiftCam;
        o.invertCamRotation = g.invertCamRotation;
        o.cloudLayer = g.cloudLayer;
        o.lastPlayer = g.lastPlayer;
      }

      // 3. 启动配置
      if (profile.launchConfig) {
        try {
          await backend.saveLaunchConfig(
            await playerIniPath(instancePath),
            profile.launchConfig
          );
        } catch {
          // 无 Player.ini：忽略
        }
      }

      // 4. mod 配置
      if (profile.modConfigs) {
        const cfgDir = await join(instancePath, ...MODCFG_DIR.split("/"));
        for (const [fileName, cfg] of Object.entries(profile.modConfigs)) {
          try {
            await backend.saveModConfig(await join(cfgDir, fileName), cfg);
          } catch {
            // 跳过
          }
        }
      }
    },

    /** 按“逻辑相对路径”切换某文件的启用/禁用状态 */
    async toggleFile(logical: string, enable: boolean) {
      const instancePath = usePrefStore().instancePath!;
      const parts = logical.split("/");
      const fileName = parts.pop()!;
      const relDir = parts.join("/");
      const absDir = relDir
        ? await join(instancePath, ...relDir.split("/"))
        : instancePath;
      if (enable) await backend.enable(absDir, `${fileName}.disable`);
      else await backend.disable(absDir, fileName);
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProfilesStore, import.meta.hot));
}
