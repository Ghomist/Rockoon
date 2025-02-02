import process from "@/api/process";
import { checkBallanceFolder } from "@/utils/instance";
import { join } from "@tauri-apps/api/path";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useFileStore } from "./fs";
import app from "@/api/app";
import { usePrefStore } from "./pref";

export const useAppStore = defineStore("app", {
  state: (): AppStore => ({
    page: "home",
    selected: undefined,
    runningInstance: undefined,
    messageQueue: []
  }),
  getters: {
    selectedName: state =>
      useFileStore().instances.find(x => x.path === state.selected?.path)?.name
  },
  actions: {
    async changeSelect(path: string) {
      const instance = await checkBallanceFolder(path);
      if (instance) this.selected = instance;
    },
    renameSelectedInstance(name: string) {
      if (!name) return;
      const fs = useFileStore();
      const index = fs.instances.findIndex(x => x.path === this.selected?.path);
      if (index !== -1) {
        fs.instances[index].name = name;
      }
    },
    async launchInstance(instance: BallanceInstance) {
      const cwd = await join(instance.path, "Bin");
      const bin = await join(cwd, "Player.exe");
      const pid = await process.execute(cwd, bin);
      if (usePrefStore().hideWinWhenLaunch) await app.hideWindow();
      this.runningInstance = pid;
    },
    async killInstance() {
      if (this.runningInstance) {
        await process.kill(this.runningInstance);
        await app.showWindow();
        this.runningInstance = undefined;
      }
    },
    async checkRunningInstance() {
      if (this.runningInstance) {
        const exists = await process.check(this.runningInstance);
        if (!exists) {
          this.runningInstance = undefined;
          await app.showWindow();
        }
      }
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
