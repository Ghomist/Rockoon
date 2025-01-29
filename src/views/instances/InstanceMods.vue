<script setup lang="ts">
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { convertFileSize } from "@/utils/math.ts";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import { computed, nextTick, reactive, ref } from "vue";
import ExtraButtons from "./components/ExtraButtons.vue";

const app = useAppStore();
const fs = useFileStore();
const instance = computed(() => app.selected!);

const modsCollapse = ref<InstanceType<typeof BasicCollapse>>();
const mods = ref<ManagedFile[]>([]);
const readMods = async () => {
  mods.value = await fs.getInstanceFiles(instance.value.path, "mod");
  nextTick(() => {
    modsCollapse.value?.resize();
  });
};
// const onToggleMod = (mod: MapOrMod) => {
// TODO
// };
const modsExtraButtons = reactive([
  {
    icon: "folder-open-line",
    callback: async () => {
      const modFolder = await join(instance.value.path, "ModLoader", "Mods");
      await open(modFolder);
    }
  },
  {
    icon: "add-circle-line",
    callback: () => {
      browseFile({
        title: "请选择 Ballance Mod 文件",
        multiple: true,
        filters: [
          { name: "Ballance Mod", extensions: ["bmod"] },
          { name: "Ballance Mod Zip", extensions: ["zip"] }
        ]
      }).then(res => {
        if (!res) return;
        if (!Array.isArray(res)) res = [res];
        console.debug(res);
      });
    }
  },
  {
    icon: "refresh-1-line",
    callback: readMods
  }
]);
</script>

<template>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    ref="modsCollapse"
    title="模组"
    open
    @on-expand="readMods()"
  >
    <template #buttons>
      <ExtraButtons :schema="modsExtraButtons" />
    </template>
    <BasicConfig v-for="mod in mods" :title="mod.name">
      <p
        style="
          margin-right: 4px;
          font-size: 14px;
          color: var(--color-text-light);
        "
      >
        {{ convertFileSize(mod.size) }} | {{ mod.ext.toUpperCase() }}
      </p>
      <!-- <BasicSwitch v-model="mod.enabled" @toggled="onToggleMod(mod)" /> -->
    </BasicConfig>
  </BasicCollapse>
</template>
