<script setup lang="ts">
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import SwitchButton from "@/components/SwitchButton.vue";
import { clampString } from "@/utils/format";
import { openDialog, sendMessage } from "@/utils/message";
import { join } from "@tauri-apps/api/path";
import { download } from "@tauri-apps/plugin-upload";
import { h, onMounted, ref } from "vue";
import InstanceSelection from "./InstanceSelection.vue";
import ModDetails from "./ModDetails.vue";

const props = defineProps<{
  cache: YsCache;
}>();
const categories = ["Mod"];
const mods = ref<YsFile[]>([]);

const filterText = ref("");
const filteredList = ref<YsFile[]>([]);
const filterType = ref("bmlp");

const onSearch = () => {
  if (filterText.value) {
    const filters = filterText.value
      .trim()
      .split(" ")
      .map(x => x.toLowerCase());
    console.log(filterType.value);
    filteredList.value = mods.value.filter(x =>
      filters.every(filter =>
        `${x.filename} ${x.notes}`.toLowerCase().includes(filter)
      )
    );
  } else {
    filteredList.value = mods.value;
  }
  filteredList.value = filteredList.value.filter(x =>
    x.filename.endsWith(filterType.value === "bmlp" ? ".bmodp" : ".bmod")
  );
};

const onDownload = (file: YsFile) => {
  openDialog(() => h(ModDetails, { file }), {
    title: "Mod 详情",
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
              "Mods",
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
        handledFile.filename = handledFile.filename.replace(
          /(\.[a-zA-Z]+)$/gi,
          matched => matched.toLowerCase()
        );
        mods.value.push(handledFile);
      }
    }
  }

  onSearch();
});
</script>

<template>
  <div>
    <BasicCollapse title="筛选" open>
      <BasicConfig
        title="关键词"
        tooltip="支持搜索名称、作者、备注，以空格分隔多个关键词"
      >
        <BasicInput v-model="filterText" />
        <BasicButton @click="onSearch">搜索</BasicButton>
      </BasicConfig>
      <BasicConfig title="筛选类型" tooltip="选择 Mod 类型">
        <SwitchButton
          v-for="modType in ['bml', 'bmlp']"
          :active="filterType === modType"
          @click="
            () => {
              filterType = modType;
              onSearch();
            }
          "
        >
          {{ modType === "bml" ? "BML" : "BML+" }}
        </SwitchButton>
      </BasicConfig>
    </BasicCollapse>
    <BasicCollapse title="Mod 列表" open>
      <TransitionGroup name="list">
        <BasicConfig
          v-for="f in filteredList"
          :key="f.url"
          :title="clampString(f.filename.replace(/\.bmodp?/gi, ''), 20)"
          :tooltip="f.notes || f.category"
        >
          <p style="margin: 10px">{{ f.size }}</p>
          <BasicButton @click="onDownload(f)">获取</BasicButton>
        </BasicConfig>
      </TransitionGroup>
    </BasicCollapse>
  </div>
</template>
