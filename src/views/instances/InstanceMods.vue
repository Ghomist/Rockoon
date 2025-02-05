<script setup lang="ts">
import file from "@/api/fs";
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { formatModName } from "@/utils/format";
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
const reading = ref(false);
const readMods = async () => {
  reading.value = true;
  mods.value = await fs.getInstanceFiles(instance.value.path, "mod");
  nextTick(() => {
    modsCollapse.value?.resize();
    reading.value = false;
  });
};
const onToggleMod = async (mod: ManagedFile, value: boolean) => {
  if (reading.value) return;
  if (value) {
    await file.enable(
      await join(instance.value.path, "ModLoader", "Mods"),
      mod.name
    );
  } else {
    await file.disable(
      await join(instance.value.path, "ModLoader", "Mods"),
      mod.name
    );
  }
  await readMods();
};
const onDeleteMod = async (mod: ManagedFile) => {
  const modFile = await join(
    instance.value.path,
    "ModLoader",
    "Mods",
    mod.name
  );
  await file.delete(modFile);
  await readMods();
};
const toggleAllMods = async (enable: boolean) => {
  for (const mod of mods.value) await onToggleMod(mod, enable);
};
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
    title="模组操作"
    open
  >
    <BasicConfig title="禁用所有 Mod">
      <BasicButton @click="toggleAllMods(false)">全部禁用</BasicButton>
    </BasicConfig>
    <BasicConfig title="启用所有 Mod">
      <BasicButton @click="toggleAllMods(true)">全部启用</BasicButton>
    </BasicConfig>
  </BasicCollapse>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    ref="modsCollapse"
    title="模组列表"
    @expand="readMods()"
  >
    <template #buttons>
      <ExtraButtons :schema="modsExtraButtons" />
    </template>
    <BasicConfig
      v-for="mod in mods"
      :title="formatModName(mod.name)"
      :tooltip="convertFileSize(mod.size)"
    >
      <BasicSwitch
        :model-value="!mod.name.endsWith('.disable')"
        @toggled="onToggleMod(mod, $event as boolean)"
      />
      <BasicButton @click="onDeleteMod(mod)">删除</BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
