import app from "@/api/app";
import process from "@/api/process";
import { checkBallanceFolder } from "@/utils/instance";
import { openDialog } from "@/utils/message";
import { join } from "@tauri-apps/api/path";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useFileStore } from "./fs";
import { usePrefStore } from "./pref";

export const useAppStore = defineStore("app", {
  state: (): AppStore => ({
    page: "home",
    selected: undefined,
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0,
    messageQueue: []
  }),
  getters: {
    selectedName: state =>
      useFileStore().instances.find(x => x.path === state.selected?.path)?.name,
    selectedPlaytime: state =>
      useFileStore().instances.find(x => x.path === state.selected?.path)
        ?.playtime
  },
  actions: {
    async changeSelect(path: string) {
      try {
        const instance = await checkBallanceFolder(path);
        if (instance) this.selected = instance;
        else {
          this.selected = undefined;
          openDialog("该游戏已被移动或删除，请重新添加", {
            title: "出错啦",
            onClose: () => {
              useFileStore().removeInstance(path);
            }
          });
        }
      } catch (e) {
        openDialog(`该游戏出现错误了，请尝试重新添加（${e}）`, {
          title: "出错啦",
          onClose: () => {
            useFileStore().removeInstance(path);
          }
        });
        return;
      }
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
      this.runningInstancePid = pid;
      this.runningInstancePath = instance.path;
      this.runningInstanceTimestamp = Date.now();
    },
    async killInstance() {
      if (this.runningInstancePid) {
        await process.kill(this.runningInstancePid);
        await app.showWindow();
        this.updateInstanceRunningTime();
        this.runningInstancePid = undefined;
      }
    },
    async checkRunningInstance() {
      if (this.runningInstancePid) {
        const exists = await process.check(this.runningInstancePid);
        if (!exists) {
          await app.showWindow();
          this.updateInstanceRunningTime();
          this.runningInstancePid = undefined;
        }
      }
    },
    updateInstanceRunningTime() {
      const fs = useFileStore();
      const index = fs.instances.findIndex(
        x => x.path === this.runningInstancePath
      );
      if (index !== -1) {
        const time = Date.now() - this.runningInstanceTimestamp!;
        fs.instances[index].playtime += time;
        console.info(`Played for ${time}ms`);
      }
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
