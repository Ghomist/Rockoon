import { instanceBackend } from "@/backend/instance";
import storage from "@/utils/storage";
import { sep } from "@tauri-apps/api/path";
import { acceptHMRUpdate, defineStore } from "pinia";
import { useAppStore } from "./app";

const INSTANCES_STORE_KEY = "rockoon-instances";

export const useInstancesStore = defineStore(INSTANCES_STORE_KEY, {
  state: () =>
    storage.getWithDefault<InstancesStore>(INSTANCES_STORE_KEY, {
      instances: []
    }),
  actions: {
    save() {
      storage.set(INSTANCES_STORE_KEY, this.$state);
    },
    async addInstance(path: string, name?: string) {
      if (this.instances.some(x => x.path === path)) return;

      const data = await instanceBackend.getInstanceData(path);
      if (data) {
        name ??= path.split(sep()).pop() ?? "Ballance";
        this.instances.push({ name, path, playtime: 0 });
        this.save();
        return data;
      }
    },
    removeInstance(path: string) {
      const index = this.instances.findIndex(x => x.path === path);
      if (index !== -1) {
        const app = useAppStore();
        if (app.selectedInstanceData?.path === path) {
          app.selectedInstanceData = undefined;
        }
        this.instances.splice(index, 1);
        this.save();
      }
    },
    findInstance(path: string) {
      return this.instances.find(x => x.path === path);
    },
    renameInstance(path: string, newName: string) {
      const instance = this.instances.find(x => x.path === path);
      if (instance) {
        instance.name = newName;
        this.save();
      }
    }
  }
});

// 热更新
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInstancesStore, import.meta.hot));
}
