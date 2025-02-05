<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import HeaderButton from "./components/HeaderButton.vue";
import HeaderLogo from "./components/HeaderLogo.vue";
import { open } from "@tauri-apps/plugin-shell";
import { useAppStore } from "@/stores/app";
import { Window } from "@tauri-apps/api/window";

type NavSchema = {
  id?: PageId;
  name?: string;
  icon?: string;
  action?: () => void;
};

const app = useAppStore();
const window = new Window("main");

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
  // {
  //   id: "tools",
  //   name: "工具",
  //   icon: "tool-line"
  // },
  // {
  //   id: "download",
  //   name: "下载",
  //   icon: "download-2-line"
  // },
  // {
  //   id: "help",
  //   name: "帮助",
  //   icon: "question-line"
  // }
  {
    id: "wiki",
    name: "Wiki",
    icon: "external-link-line",
    action: () => {
      open("https://ballance.jxpxxzj.cn/wiki/首页");
    }
  }
]);
const groupOthers = reactive<NavSchema[]>([
  {
    id: "settings",
    icon: "settings-1-line",
    action: () => (app.page = "settings")
  },
  {
    icon: "minimize-line",
    action: () => window.minimize()
  },
  {
    icon: "close-line",
    action: () => window.close()
  }
]);

const headerContainer = ref<HTMLElement>();
onMounted(() => {
  const dragAttr = "data-tauri-drag-region";
  headerContainer.value!.setAttribute(dragAttr, "");
  for (const child of headerContainer.value!.children) {
    child.setAttribute(dragAttr, "");
  }
});
</script>

<template>
  <div ref="headerContainer" class="header-container">
    <div class="header-logo" style="width: 200px; max-width: 200px">
      <HeaderLogo data-tauri-drag-region style="margin-left: 6px" />
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
  user-select: none;

  /* width: 100%; */
  margin-left: 10px;
}
</style>
