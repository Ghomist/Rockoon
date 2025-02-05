<script setup lang="ts">
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSlider from "@/components/BasicSlider.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { open } from "@tauri-apps/plugin-shell";
import { computed, reactive, ref } from "vue";
import ExtraButtons from "./components/ExtraButtons.vue";
import MultiSelect from "./components/MultiSelect.vue";
import VirtualKeyboard from "./components/VirtualKeyboard.vue";
import { openDialog, sendMessage } from "@/utils/message";

const app = useAppStore();
const fs = useFileStore();
const instance = computed(() => app.selected!);

const basicExtraButtons = reactive([
  {
    icon: "folder-open-line",
    callback: () => open(instance.value.path)
  }
]);

const editingKey = ref<BallanceKeyType | "all">("all");

const onRemoveInstance = () => {
  openDialog(
    `确认要移除实例吗？本地游戏文件不会被删除，你仍然可以再次将游戏添加至启动器`,
    {
      title: `移除实例 "${app.selectedName}"`,
      onSure: () => {
        fs.removeInstance(instance.value.path);
        sendMessage("实例已移除");
      }
    }
  );
};
</script>

<template>
  <BasicCollapse title="基本信息" open>
    <template #buttons>
      <ExtraButtons :schema="basicExtraButtons" />
    </template>
    <BasicConfig title="实例名称">
      <BasicInput
        :model-value="app.selectedName!"
        @update:model-value="app.renameSelectedInstance($event)"
      />
    </BasicConfig>
    <BasicConfig title="实例位置" tooltip="路径暂不支持直接修改">
      <BasicInput v-model="instance.path" disabled />
    </BasicConfig>
    <BasicConfig title="BML" tooltip="Ballance Mod Loader by @Gamepiaynmo">
      <p style="margin-right: 10px; font-size: 14px">
        {{ instance.bmlInstalled ? "已安装" : "未安装" }}
      </p>
    </BasicConfig>
    <BasicConfig title="BML Plus" tooltip="Ballance Mod Loader Plus by @doyaGu">
      <p style="margin-right: 10px; font-size: 14px">
        {{ instance.bmlpInstalled ? "已安装" : "未安装" }}
      </p>
    </BasicConfig>
    <BasicConfig
      title="新 Player"
      tooltip="Brand-new Ballance Player by @doyaGu"
    >
      <p style="margin-right: 10px; font-size: 14px">
        {{ instance.newPlayer ? "已安装" : "未安装" }}
      </p>
    </BasicConfig>
  </BasicCollapse>
  <BasicCollapse title="游戏设置" open>
    <BasicConfig title="音乐音量" tooltip="此选项不影响音效音量">
      <BasicSlider v-model="instance.options.volume" :percentage="true" />
    </BasicConfig>
    <BasicConfig title="启用云层">
      <BasicSwitch v-model="instance.options.cloudLayer" />
    </BasicConfig>
    <BasicConfig title="垂直同步">
      <BasicSwitch v-model="instance.options.syncToScreen" />
    </BasicConfig>
    <BasicConfig title="反转相机旋转">
      <BasicSwitch v-model="instance.options.invertCamRotation" />
    </BasicConfig>
    <BasicConfig title="按键绑定">
      <MultiSelect @on-key-change="editingKey = $event" />
    </BasicConfig>
    <VirtualKeyboard :editing="editingKey" />
  </BasicCollapse>
  <BasicCollapse title="其它操作" open>
    <!-- TODO -->
    <!-- <BasicConfig v-if="instance.bmlInstalled" title="启用 BML">
      <BasicSwitch v-model="instance.bmlEnabled" />
    </BasicConfig>
    <BasicConfig v-if="instance.bmlpInstalled" title="启用 BML Plus">
      <BasicSwitch v-model="instance.bmlpEnabled" />
    </BasicConfig> -->
    <BasicConfig title="移除此实例" tooltip="不会删除游戏文件">
      <BasicButton @click="onRemoveInstance">移除</BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
