<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicButton from "@/components/BasicButton.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSplit from "@/components/BasicSplit.vue";
import { openDialog } from "@/utils/message";
import { YsFile } from "@/utils/fetcher";
import { onMounted, reactive, ref, watch } from "vue";

const props = defineProps({
  list: { type: Array<YsFile>, required: true }
});

const filteredList = reactive<any[]>([]);
const filterText = ref("");
watch(props, () => changeData());
watch(filterText, () => changeData());

const changeData = (): Promise<void> =>
  new Promise((resolve, _) => {
    const filters = filterText.value.split(" ").map(x => x.toLowerCase());
    const result = props.list.filter(x =>
      filters.every(
        f =>
          x.filename.toLowerCase().indexOf(f) !== -1 ||
          x.notes.toLowerCase().indexOf(f) !== -1
      )
    );
    let i = 0;

    while (i < filteredList.length) {
      if (result.indexOf(filteredList[i]) === -1) {
        filteredList.splice(i, 1);
      } else {
        i++;
      }
    }
    i = 0;
    while (i < result.length) {
      if (filteredList.indexOf(result[i]) === -1) {
        filteredList.splice(0, 0, result[i]);
      }
      i++;
    }
    resolve();
  });

onMounted(() => changeData());
</script>

<template>
  <BasicBlock style="position: relative; width: 9999px; margin-left: 0">
    <div
      style="
        position: sticky;
        top: 0;
        left: 0;
        width: 100%;
        height: 36px;
        padding: 0 10px;
      "
    >
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 8px 10px;
          margin-top: 0;
        "
      >
        <div style="display: flex; align-items: center">
          <p>筛选：</p>
          <BasicInput
            style="text-align: left"
            v-model="filterText"
            placeholder="输入文件名称或作者名称"
          />
        </div>
        <div>共 {{ filteredList.length }} 个结果</div>
      </div>
      <BasicSplit />
    </div>
    <div style="width: 100%; margin-top: 10px; overflow-y: scroll">
      <TransitionGroup name="list">
        <div
          v-for="f in filteredList"
          :key="JSON.stringify(f)"
          style="width: 100%"
        >
          <BasicConfig
            :title="f.name"
            :tooltip="f.author ? `@${f.author}` : '未知作者'"
          >
            <!-- <p>{{ map.difficulty || '未知难度' }}</p> -->
            <p style="margin: 10px">{{ f.size }}</p>
            <BasicButton @click="openDialog(JSON.stringify(f, undefined, 2))"
              >获取</BasicButton
            >
          </BasicConfig>
        </div>
      </TransitionGroup>
    </div>
  </BasicBlock>
</template>
