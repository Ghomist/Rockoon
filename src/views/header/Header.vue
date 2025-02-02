<script setup lang="ts">
import { reactive } from "vue";
import HeaderButton from "./components/HeaderButton.vue";
import HeaderLogo from "./components/HeaderLogo.vue";
import { open } from "@tauri-apps/plugin-shell";

type NavSchema = {
  id: PageId;
  name: string;
  icon?: string;
  action?: () => void;
};

const groupCenter = reactive<NavSchema[]>([
  {
    id: "home",
    name: "主页",
    icon: "home-3-line"
  },
  {
    id: "instances",
    name: "实例",
    icon: "classify-2-line"
  },
  {
    id: "tools",
    name: "工具",
    icon: "tool-line"
  },
  // {
  //   id: "download",
  //   name: "下载",
  //   icon: "download-2-line"
  // },
  {
    id: "help",
    name: "帮助",
    icon: "question-line"
  }
]);
const groupOthers = reactive<NavSchema[]>([
  {
    id: "wiki",
    name: "Wiki",
    icon: "external-link-line",
    action: () => {
      open("https://ballance.jxpxxzj.cn/wiki/首页");
    }
  },
  {
    id: "settings",
    name: "设置",
    icon: "settings-1-line"
  }
]);
</script>

<template>
  <div class="header-container">
    <div class="header-logo" style="width: 200px; max-width: 200px">
      <HeaderLogo style="margin-left: 6px" />
    </div>
    <div class="header-buttons" style="display: flex; gap: 6px">
      <HeaderButton
        v-for="item in groupCenter"
        :page="item.id"
        :content="item.name"
        :icon="item.icon"
      >
      </HeaderButton>
    </div>
    <div
      class="header-other"
      style="display: flex; gap: 6px; justify-content: end; width: 200px"
    >
      <HeaderButton
        v-for="item in groupOthers"
        :page="item.id"
        :content="item.name"
        :icon="item.icon"
        :action="item.action"
      ></HeaderButton>
    </div>
  </div>
</template>

<style>
.header-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  margin-right: 10px;

  /* width: 100%; */
  margin-left: 10px;
}

.block {
  width: 20px;
  height: 20px;
  margin: 20px;
  background-color: aqua;
}
</style>
