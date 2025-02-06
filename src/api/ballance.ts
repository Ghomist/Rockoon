import { invoke } from "@tauri-apps/api/core";

export default {
  readOptions: (path: string) =>
    invoke<BallanceOptions>("read_options", { path }),
  saveOptions: (path: string, options: BallanceOptions) =>
    invoke<void>("save_options", { options, path }),
  readLaunchConfig: (path: string) =>
    invoke<NewPlayerConfig>("read_launch_config", { path }),
  saveLaunchConfig: (path: string, config: NewPlayerConfig) =>
    invoke<void>("save_launch_config", { config, path }),
  readModConfig: (path: string) =>
    invoke<ModConfig>("read_mod_config", { path }),
  saveModConfig: (path: string, config: ModConfig) =>
    invoke<void>("save_mod_config", { config, path })
};
