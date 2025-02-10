<script setup lang="ts">
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { openDialog, sendMessage } from "@/utils/message";
import { join } from "@tauri-apps/api/path";
import { download } from "@tauri-apps/plugin-upload";
import { h, onMounted, ref } from "vue";
import InstanceSelection from "./InstanceSelection.vue";
import MapDetails from "./MapDetails.vue";

const props = defineProps<{
  cache: YsCache;
}>();
const categories = ["地图", "制图", "专业竞速", "访客上传"];
const maps = ref<YsFile[]>([]);

const filterText = ref("");
const filteredList = ref<YsFile[]>([]);
const showSpecialMap = ref(false);

const onSearch = () => {
  let result: YsFile[];
  if (filterText.value) {
    const filters = filterText.value
      .trim()
      .split(" ")
      .map(x => x.toLowerCase());
    result = maps.value.filter(x =>
      filters.every(filter =>
        `${x.category} ${x.filename} ${x.notes}`.toLowerCase().includes(filter)
      )
    );
  } else {
    result = maps.value;
  }
  if (!showSpecialMap.value) {
    result = result.filter(x => x.filename.toLowerCase().endsWith(".nmo"));
  }
  filteredList.value = result;
};

const onDownload = (file: YsFile) => {
  openDialog(() => h(MapDetails, { file }), {
    title: "地图详情",
    sureText: "开始下载",
    onSure: () => {
      const selectionRef = ref<InstanceType<typeof InstanceSelection>>();
      openDialog(() => h(InstanceSelection, { ref: selectionRef }), {
        title: "下载位置",
        sureText: "开始下载",
        onSure: async () => {
          if (selectionRef.value?.selectedPath) {
            const filePath = await join(
              selectionRef.value.selectedPath,
              "ModLoader",
              "Maps",
              file.filename
            );
            sendMessage(`开始下载 ${file.filename}`);
            await download(file.url, filePath);
            sendMessage(`${file.filename} 下载完成！`);
          } else {
            sendMessage("未选择游戏，下载取消");
          }
        }
      });
    }
  });
};

onMounted(() => {
  for (const folder of props.cache.folders) {
    for (const file of props.cache.files[folder.id]) {
      if (categories.some(cat => file.category.includes(cat))) {
        const handledFile = { ...file };
        handledFile.filename = file.filename.replace(/(\.level)/gi, "");
        handledFile.filename = handledFile.filename.replace(
          /(\.[a-zA-Z]+)$/gi,
          matched => matched.toLowerCase()
        );
        maps.value.push(handledFile);
      }
    }
  }

  onSearch();
});
</script>

<template>
  <BasicCollapse title="筛选" open>
    <BasicConfig
      title="关键词"
      tooltip="支持搜索名称、作者、备注，以空格分隔多个关键词"
    >
      <BasicInput v-model="filterText" />
      <BasicButton @click="onSearch">搜索</BasicButton>
    </BasicConfig>
    <BasicConfig
      title="显示特殊地图"
      tooltip="部分地图需要手动处理，例如解压、安装配套插件等"
    >
      <BasicSwitch v-model="showSpecialMap" @toggled="onSearch" />
    </BasicConfig>
  </BasicCollapse>
  <BasicCollapse title="地图列表" open>
    <BasicConfig
      v-for="f in filteredList"
      :key="f.url"
      :title="
        f.filename.replace(/\.(nmo|7z|zip|rar)/gi, '') +
        (f.filename.endsWith('.nmo') ? '' : '*')
      "
      :tooltip="f.notes || f.category"
    >
      <p style="margin: 10px">{{ f.size }}</p>
      <BasicButton @click="onDownload(f)">获取</BasicButton>
    </BasicConfig>
  </BasicCollapse>
</template>
