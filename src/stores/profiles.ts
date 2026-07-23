import { create } from "zustand";
import backend from "@/backend";
import { useAppStore } from "./app";
import { usePrefStore } from "./pref";
import { join } from "@tauri-apps/api/path";

const PROFILE_DIR = ".rockoon";
const PROFILE_FILE = "profiles.json";

/** Resource dirs whose disable-state we capture per-profile. */
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

interface ProfilesState {
  index: ProfileIndex;
  profiles: () => Profile[];
  currentProfile: () => Profile | undefined;
  load: () => Promise<void>;
  save: () => Promise<void>;
  ensureDefaultProfile: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  createProfile: (name: string) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  captureCurrentState: () => Promise<{
    disabledFiles: string[];
    gameOptions: ProfileGameOptions;
    launchConfig: BallanceLaunchConfig | undefined;
    modConfigs: Record<string, ModConfig>;
  }>;
  enumerateDisabled: (
    absDir: string,
    logicalPrefix: string,
    exts: string[]
  ) => Promise<string[]>;
  captureModConfigs: (
    instancePath: string
  ) => Promise<Record<string, ModConfig>>;
  applyState: (profile: Profile) => Promise<void>;
  toggleFile: (logical: string, enable: boolean) => Promise<void>;
}

const emptyIndex: ProfileIndex = { profiles: [], currentId: "" };

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  index: emptyIndex,

  profiles: () => get().index.profiles,
  currentProfile: () =>
    get().index.profiles.find(p => p.id === get().index.currentId),

  /** Read .rockoon/profiles.json from disk; create default if missing/corrupt. */
  async load() {
    const instancePath = usePrefStore.getState().instancePath;
    if (!instancePath) return;

    const file = await profilesFilePath(instancePath);
    if (await backend.exists(file)) {
      try {
        const text = await backend.readTextFile(file);
        const parsed = JSON.parse(text) as ProfileIndex;
        if (parsed?.profiles?.length) set({ index: parsed });
      } catch {
        // corrupt: fall through to default creation
      }
    }

    const { index } = get();
    if (!index.profiles.length) {
      await get().ensureDefaultProfile();
    } else if (!index.profiles.some(p => p.id === index.currentId)) {
      set({
        index: { ...index, currentId: index.profiles[0].id }
      });
    }
  },

  async save() {
    const instancePath = usePrefStore.getState().instancePath;
    if (!instancePath) return;
    await backend.writeTextFile(
      await profilesFilePath(instancePath),
      JSON.stringify(get().index)
    );
  },

  /** Create a default profile from the current disk state. */
  async ensureDefaultProfile() {
    const snapshot = await get().captureCurrentState();
    const profile: Profile = {
      id: genId(),
      name: "Default",
      createdAt: Date.now(),
      ...snapshot
    };
    set({
      index: { profiles: [profile], currentId: profile.id }
    });
    await get().save();
  },

  /** Switch profiles: snapshot outgoing, then apply target state to disk. */
  async switchProfile(id) {
    const { index } = get();
    if (id === index.currentId) return;
    const target = index.profiles.find(p => p.id === id);
    if (!target) return;

    const outgoing = get().currentProfile();
    if (outgoing) {
      const snapshot = await get().captureCurrentState();
      const updated: Profile = {
        ...outgoing,
        disabledFiles: snapshot.disabledFiles,
        gameOptions: snapshot.gameOptions,
        launchConfig: snapshot.launchConfig,
        modConfigs: snapshot.modConfigs
      };
      set({
        index: {
          ...index,
          profiles: index.profiles.map(p =>
            p.id === outgoing.id ? updated : p
          )
        }
      });
    }

    await get().applyState(target);
    set({ index: { ...get().index, currentId: id } });
    await get().save();
    // Refresh app store (game options etc.) and signal all pages to re-fetch
    const instancePath = usePrefStore.getState().instancePath;
    if (instancePath) await useAppStore.getState().loadInstance(instancePath);
    useAppStore.getState().triggerRefresh();
  },

  /** Snapshot current disk state as a new profile, mark as current. */
  async createProfile(name) {
    const snapshot = await get().captureCurrentState();
    const profile: Profile = {
      id: genId(),
      name,
      createdAt: Date.now(),
      ...snapshot
    };
    const { index } = get();
    set({
      index: {
        profiles: [...index.profiles, profile],
        currentId: profile.id
      }
    });
    await get().save();
    return profile;
  },

  async deleteProfile(id) {
    const { index } = get();
    if (index.profiles.length <= 1) return; // keep at least one
    const next = index.profiles.filter(p => p.id !== id);
    let newCurrentId = index.currentId;
    const switched = index.currentId === id;
    if (switched) {
      newCurrentId = next[0].id;
      await get().applyState(next[0]);
    }
    set({ index: { profiles: next, currentId: newCurrentId } });
    await get().save();
    if (switched) {
      const instancePath = usePrefStore.getState().instancePath;
      if (instancePath) await useAppStore.getState().loadInstance(instancePath);
      useAppStore.getState().triggerRefresh();
    }
  },

  async renameProfile(id, name) {
    const { index } = get();
    set({
      index: {
        ...index,
        profiles: index.profiles.map(p => (p.id === id ? { ...p, name } : p))
      }
    });
    await get().save();
  },

  /** Snapshot current disk state (without id/name/createdAt). */
  async captureCurrentState() {
    const instancePath = usePrefStore.getState().instancePath!;
    const app = useAppStore.getState();

    const disabledFiles: string[] = [];
    for (const { dir, exts } of RESOURCE_DIRS) {
      const absDir = await join(instancePath, ...dir.split("/"));
      disabledFiles.push(...(await get().enumerateDisabled(absDir, dir, exts)));
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
      // no Player.ini: leave empty
    }

    const modConfigs = await get().captureModConfigs(instancePath);
    return { disabledFiles, gameOptions, launchConfig, modConfigs };
  },

  /** Recursively enumerate logical paths of disabled files under a dir. */
  async enumerateDisabled(absDir, logicalPrefix, exts) {
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
    } catch {
      // ignore
    }
    for (const d of dirs) {
      const baseName = d.split(/[\\/]/).pop()!;
      result.push(
        ...(await get().enumerateDisabled(
          d,
          `${logicalPrefix}/${baseName}`,
          exts
        ))
      );
    }
    return result;
  },

  async captureModConfigs(instancePath) {
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
        result[f.name] = await backend.readModConfig(
          await join(cfgDir, f.name)
        );
      } catch {
        // skip unreadable
      }
    }
    return result;
  },

  /** Apply a profile's state to disk. */
  async applyState(profile) {
    const instancePath = usePrefStore.getState().instancePath!;

    // 1. Sync disabled set: diff, toggle as needed.
    const currentDisabled = new Set<string>();
    for (const { dir, exts } of RESOURCE_DIRS) {
      const absDir = await join(instancePath, ...dir.split("/"));
      for (const f of await get().enumerateDisabled(absDir, dir, exts)) {
        currentDisabled.add(f);
      }
    }
    const targetDisabled = new Set(profile.disabledFiles);
    for (const logical of currentDisabled) {
      if (!targetDisabled.has(logical)) await get().toggleFile(logical, true);
    }
    for (const logical of targetDisabled) {
      if (!currentDisabled.has(logical)) await get().toggleFile(logical, false);
    }

    // 2. Game options: merge subset (keep levelLock/highscores), persisted by watcher
    const app = useAppStore.getState();
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
      // trigger a save by mutating the store
      useAppStore.setState({
        selectedInstanceData: { ...app.selectedInstanceData, options: o }
      });
    }

    // 3. Launch config
    if (profile.launchConfig) {
      try {
        await backend.saveLaunchConfig(
          await playerIniPath(instancePath),
          profile.launchConfig
        );
      } catch {
        // no Player.ini: ignore
      }
    }

    // 4. Mod configs
    if (profile.modConfigs) {
      const cfgDir = await join(instancePath, ...MODCFG_DIR.split("/"));
      for (const [fileName, cfg] of Object.entries(profile.modConfigs)) {
        try {
          await backend.saveModConfig(await join(cfgDir, fileName), cfg);
        } catch {
          // skip
        }
      }
    }
  },

  /** Toggle enable/disable for a file by its logical path. */
  async toggleFile(logical, enable) {
    const instancePath = usePrefStore.getState().instancePath!;
    const parts = logical.split("/");
    const fileName = parts.pop()!;
    const relDir = parts.join("/");
    const absDir = relDir
      ? await join(instancePath, ...relDir.split("/"))
      : instancePath;
    if (enable) await backend.enable(absDir, `${fileName}.disable`);
    else await backend.disable(absDir, fileName);
  }
}));
