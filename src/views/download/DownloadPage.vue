<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicIcon from "@/components/BasicIcon.vue";
import BasicNavItem from "@/components/BasicNavItem.vue";
import BasicSplit from "@/components/BasicSplit.vue";
import { fetchFiles } from "@/utils/fetcher";
import { open } from "@tauri-apps/plugin-shell";
import { onMounted, ref } from "vue";
import NoneSelectedPage from "../instances/NoneSelectedPage.vue";
import AllFiles from "./AllFiles.vue";
import DownloadMap from "./DownloadMap.vue";
import DownloadMod from "./DownloadMod.vue";
import { sendMessage } from "@/utils/message";

const loading = ref(true);
const cache = ref<YsCache>();
const subPage = ref("maps");
const subPageData = [
  {
    label: "自制地图",
    value: "maps",
    page: DownloadMap
  },
  {
    label: "模组插件",
    value: "mods",
    page: DownloadMod
  },
  {
    label: "游戏本体",
    value: "game"
  },
  {
    label: "全部文件",
    value: "all",
    page: AllFiles
  }
];

const onRefresh = async (refresh: boolean) => {
  if (refresh) sendMessage("正在刷新，请稍候...");
  loading.value = true;
  cache.value = await fetchFiles(refresh);
  loading.value = false;
  if (refresh) sendMessage("刷新成功！");
};
onMounted(() => onRefresh(false));
</script>

<template>
  <div class="download-container">
    <BasicBlock style="width: 200px; min-width: 200px">
      <BasicNavItem
        v-for="page in subPageData"
        :name="page.value"
        :selected="subPage === page.value"
        @clicked="subPage = page.value"
      >
        {{ page.label }}
      </BasicNavItem>
      <BasicSplit />
      <BasicNavItem
        name=""
        :selected="false"
        style="color: var(--color-text-light); border: none"
        @clicked="onRefresh(true)"
      >
        <BasicIcon icon="refresh-2-line" />
        <span> 刷新 {{ cache?.lastUpdate?.toLocaleTimeString() }} </span>
      </BasicNavItem>
      <BasicNavItem
        name=""
        :selected="false"
        style="color: var(--color-text-light); border: none"
        @clicked="open('http://ballancemaps.ysepan.com/')"
      >
        <BasicIcon icon="external-link-line" />
        <span> 打开下载站 </span>
      </BasicNavItem>
    </BasicBlock>

    <Transition name="fade" mode="out-in">
      <div v-if="!loading" class="subpage-container">
        <component
          :is="subPageData.find(x => x.value === subPage)?.page"
          :cache="cache!"
        />
      </div>
      <NoneSelectedPage v-else tips="加载中..." />
    </Transition>
  </div>
</template>

<style scoped>
.download-container {
  display: flex;
  width: 100%;
  height: 100%;
}

.subpage-container {
  width: 9999px;
  margin-left: -10px;
  overflow: visible scroll;
}
</style>
