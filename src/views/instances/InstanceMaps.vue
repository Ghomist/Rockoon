<script setup lang="ts">
import { default as file, default as fs } from "@/backend/fs";
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import { useAppStore } from "@/stores/app";
import { useInstancesStore } from "@/stores/instances";
import { formatFileName, formatFileSize, formatFileType } from "@/utils/format";
import { openDialog, sendMessage } from "@/utils/message";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watchEffect,
  WatchHandle
} from "vue";
import ExtraButtons from "./components/ExtraButtons.vue";

const app = useAppStore();
const fileStore = useInstancesStore();
const instance = computed(() => app.selectedInstanceData!);

const maps = ref<ManagedFile[]>([]);
const readMaps = async () => {
  maps.value = await fileStore.getInstanceFiles(instance.value.path, "map");
};
const onDeleteMap = async (map: ManagedFile) => {
  openDialog("确定要删除此地图吗？此操作无法撤销！", {
    title: `删除 ${map.name}`,
    onSure: async () => {
      const mapFile = await join(
        instance.value.path,
        "ModLoader",
        "Maps",
        map.name
      );
      await file.delete(mapFile);
      sendMessage("地图已删除");
      await readMaps();
    }
  });
};
const mapsExtraButtons = reactive([
  {
    icon: "folder-open-line",
    callback: async () => {
      const mapsFolder = await join(instance.value.path, "ModLoader", "Maps");
      await open(mapsFolder);
    }
  },
  {
    icon: "add-circle-line",
    callback: async () => {
      const result = await browseFile({
        title: "请选择 Ballance 地图文件",
        multiple: true,
        filters: [{ name: "Ballance 地图文件", extensions: ["cmo", "nmo"] }]
      });
      if (result) {
        if (result && result.length) {
          for (const file of result) {
            const mapFile = await join(
              instance.value.path,
              "ModLoader",
              "Maps",
              file.split(sep()).pop()!
            );
            await fs.copy(file, mapFile);
          }
        }
      }
    }
  },
  {
    icon: "refresh-1-line",
    callback: readMaps
  }
]);

let watchHandle: WatchHandle;
onMounted(() => (watchHandle = watchEffect(readMaps)));
onUnmounted(() => watchHandle?.stop());
</script>

<template>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    title="自定义地图"
    open
    @expand="readMaps()"
  >
    <template #buttons>
      <ExtraButtons :schema="mapsExtraButtons" />
    </template>
    <BasicConfig
      v-for="map in maps"
      :title="formatFileName(map.name)"
      :tooltip="`[${formatFileType(map.name)}] [${formatFileSize(map.size)}]`"
    >
      <BasicButton @click="onDeleteMap(map)"> 删除 </BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
