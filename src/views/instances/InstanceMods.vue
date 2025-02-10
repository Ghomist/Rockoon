<script setup lang="ts">
import file from "@/api/fs";
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { formatFileName, formatFileSize, formatFileType } from "@/utils/format";
import { openDialog, sendMessage } from "@/utils/message";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import { computed, h, nextTick, ref } from "vue";
import ExtraButtons from "./components/ExtraButtons.vue";
import ModConfig from "./components/ModConfig.vue";

const app = useAppStore();
const fs = useFileStore();
const instance = computed(() => app.selected!);

const mods = ref<ManagedFile[]>([]);
const reading = ref(false);
const readMods = async () => {
  reading.value = true;
  mods.value = await fs.getInstanceFiles(instance.value.path, "mod");
  nextTick(() => {
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
  openDialog("确定要删除此 Mod 吗？此操作无法撤销！", {
    title: `删除 ${mod.name}`,
    onSure: async () => {
      const modFile = await join(
        instance.value.path,
        "ModLoader",
        "Mods",
        mod.name
      );
      await file.delete(modFile);
      await readMods();
      sendMessage("Mod 已删除");
    }
  });
};
const toggleAllMods = async (enable: boolean) => {
  for (const mod of mods.value) await onToggleMod(mod, enable);
  sendMessage(enable ? "全部 Mod 已启用" : "全部 Mod 已禁用");
};
const modsExtraButtons = [
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
];

const modConfigs = ref<ManagedFile[]>([]);
const readConfigs = async () => {
  modConfigs.value = await fs.getInstanceFiles(instance.value.path, "modCfg");
};
const onEditConfig = async (cfg: ManagedFile) => {
  const componentRef = ref<InstanceType<typeof ModConfig>>();
  openDialog(
    () =>
      h(ModConfig, {
        ref: componentRef,
        instancePath: instance.value.path,
        configFile: cfg
      }),
    {
      title: cfg.name,
      onSure: async () => {
        await componentRef.value?.save();
        sendMessage("保存成功！");
      }
    }
  );
};
const onDeleteConfig = async (cfg: ManagedFile) => {
  openDialog(
    "确定要清空此配置文件吗？清除后无法修改或还原，下一次打开游戏时该 Mod 的配置会自动重置为默认",
    {
      title: `清空 ${cfg.name}`,
      onSure: async () => {
        const cfgPath = await join(
          instance.value.path,
          "ModLoader",
          "Configs",
          cfg.name
        );
        await file.delete(cfgPath);
        await readConfigs();
        sendMessage("配置文件已清空");
      }
    }
  );
};
const modConfigExtraButtons = [
  {
    icon: "folder-open-line",
    callback: async () => {
      const modFolder = await join(instance.value.path, "ModLoader", "Configs");
      await open(modFolder);
    }
  },
  {
    icon: "refresh-1-line",
    callback: readConfigs
  }
];
</script>

<template>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    title="模组操作"
    open
    @expand="readMods()"
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
    title="模组文件列表"
    @expand="readMods()"
  >
    <template #buttons>
      <ExtraButtons :schema="modsExtraButtons" />
    </template>
    <BasicConfig
      v-for="mod in mods"
      :title="formatFileName(mod.name)"
      :tooltip="`[${formatFileType(mod.name)}] [${formatFileSize(mod.size)}]`"
    >
      <BasicSwitch
        :model-value="!mod.name.endsWith('.disable')"
        @toggled="onToggleMod(mod, $event as boolean)"
      />
      <BasicButton @click="onDeleteMod(mod)">删除</BasicButton>
    </BasicConfig>
  </BasicCollapse>
  <BasicCollapse
    v-if="instance.bmlEnabled || instance.bmlpEnabled"
    title="模组配置"
    @expand="readConfigs()"
  >
    <template #buttons>
      <ExtraButtons :schema="modConfigExtraButtons" />
    </template>
    <BasicConfig
      title=""
      tooltip="新安装模组的配置需要先启动一次游戏才会在此处显示"
    />
    <BasicConfig v-for="cfg in modConfigs" :title="formatFileName(cfg.name)">
      <BasicButton @click="onEditConfig(cfg)"> 打开配置 </BasicButton>
      <BasicButton @click="onDeleteConfig(cfg)"> 清空 </BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
