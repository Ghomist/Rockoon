<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicIcon from "@/components/BasicIcon.vue";
import BasicNavItem from "@/components/BasicNavItem.vue";
import BasicSplit from "@/components/BasicSplit.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { sendMessage } from "@/utils/message";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computed, ref } from "vue";
import InstanceLaunchConfig from "./InstanceLaunchConfig.vue";
import InstanceLevels from "./InstanceLevels.vue";
import InstanceMaps from "./InstanceMaps.vue";
import InstanceMods from "./InstanceMods.vue";
import InstanceOptions from "./InstanceOptions.vue";
import NoneSelectedPage from "./NoneSelectedPage.vue";

const app = useAppStore();
const fs = useFileStore();

const onAddInstance = async () => {
  const folder = await browseFile({
    directory: true,
    title: "选择 Ballance 根目录"
  });
  if (folder) {
    const instance = await fs.addInstance(folder);
    if (instance) {
      app.selected = instance;
      sendMessage("添加游戏成功！");
    } else {
      sendMessage(
        "添加游戏失败！请确认这是 Ballance 游戏目录，也不要重复添加哦~"
      );
    }
  }
};

const subPage = ref("basic");
const subPageData = computed(() => {
  const data = [
    {
      label: "基本信息",
      value: "basic",
      page: InstanceOptions
    },
    {
      label: "关卡与高分榜",
      value: "levels",
      page: InstanceLevels
    }
  ];
  if (app.selected?.newPlayer)
    data.push({
      label: "启动项设置",
      value: "launch-config",
      page: InstanceLaunchConfig
    });
  if (app.selected?.bmlInstalled || app.selected?.bmlpInstalled)
    data.push(
      {
        label: "自制地图",
        value: "maps",
        page: InstanceMaps
      },
      {
        label: "模组插件",
        value: "mods",
        page: InstanceMods
      }
    );
  return data;
});
</script>

<template>
  <div class="instance-container">
    <div class="instance-aside">
      <BasicBlock>
        <BasicNavItem
          v-for="x in fs.instances"
          :name="x.path"
          :selected="app.selected?.path === x.path"
          @clicked="app.changeSelect(x.path)"
        >
          <p
            style="
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
          >
            {{ x.name }}
          </p>
        </BasicNavItem>
        <BasicSplit v-if="fs.instances.length" />
        <BasicNavItem
          name=""
          :selected="false"
          style="color: var(--color-text-light); border: none"
          @clicked="onAddInstance"
        >
          <BasicIcon icon="add-circle-line" />
          <span> 添加 </span>
        </BasicNavItem>
      </BasicBlock>
      <BasicBlock v-if="app.selected">
        <BasicNavItem
          v-for="page in subPageData"
          :name="page.value"
          :selected="subPage === page.value"
          @clicked="subPage = page.value"
        >
          {{ page.label }}
        </BasicNavItem>
      </BasicBlock>
    </div>
    <div class="instance-detail-container">
      <component
        v-if="app.selected"
        :is="subPageData.find(x => x.value === subPage)?.page"
      />
      <NoneSelectedPage
        v-else
        :tips="['请在左侧选择或添加一个游戏', '或前往下载界面下载一个游戏']"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.instance-container {
  display: flex;
  width: 100%;
  height: 100%;
}

.instance-aside {
  display: flex;
  flex-direction: column;

  > * {
    width: 200px;
    min-width: 200px;
  }

  & > *:first-child {
    flex: 2;
  }

  & > *:last-child {
    flex: 3;
  }

  & > *:nth-child(2) {
    margin-top: 0;
  }
}

.instance-detail-container {
  width: 9999px;
  margin-left: -10px;
  overflow: visible scroll;
}
</style>
