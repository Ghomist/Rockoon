<script setup lang="ts">
import file from "@/api/fs";
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { formatFileName, formatFileType } from "@/utils/format";
import { convertFileSize } from "@/utils/math.ts";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import { computed, nextTick, reactive, ref } from "vue";
import ExtraButtons from "./components/ExtraButtons.vue";
import { openDialog, sendMessage } from "@/utils/message";

const app = useAppStore();
const fs = useFileStore();
const instance = computed(() => app.selected!);

const mapsCollapse = ref<InstanceType<typeof BasicCollapse>>();
const maps = ref<ManagedFile[]>([]);
const readMaps = async () => {
  maps.value = await fs.getInstanceFiles(instance.value.path, "map");
  nextTick(() => {
    mapsCollapse.value?.resize();
  });
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
        // TODO
        // if (!Array.isArray(res)) res = [res];
      }
    }
  },
  {
    icon: "refresh-1-line",
    callback: readMaps
  }
]);
</script>

<template>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    ref="mapsCollapse"
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
      :tooltip="'[' + formatFileType(map.name) + ']'"
    >
      <p
        style="
          margin-right: 4px;
          font-size: 14px;
          color: var(--color-text-light);
        "
      >
        {{ convertFileSize(map.size) }}
      </p>
      <BasicButton @click="onDeleteMap(map)"> 删除 </BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
