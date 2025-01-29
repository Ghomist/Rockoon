import { invoke } from "@tauri-apps/api/core";

export default {
  readOptions: (path: string) =>
    invoke<BallanceOptions>("read_options", { path }),
  saveOptions: (path: string, options: BallanceOptions) =>
    invoke<void>("save_options", { options, path }),
  readLaunchConfig: (path: string) =>
    invoke<NewPlayerConfig>("read_launch_config", { path }),
  saveLaunchConfig: (path: string, config: NewPlayerConfig) =>
    invoke<void>("save_launch_config", { config, path })
};
