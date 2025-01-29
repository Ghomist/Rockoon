<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicNavItem from "@/components/BasicNavItem.vue";
import { ref } from "vue";

const currentKey = ref("");
const schema = [
  {
    key: "1",
    label: "关于 Ballance"
  },
  {
    key: "1.5",
    label: "新手通关教程"
  },
  {
    key: "2",
    label: "游戏打不开？"
  },
  {
    key: "3",
    label: "如何下载关卡"
  },
  {
    key: "4",
    label: "如何制作关卡"
  },
  {
    key: "5",
    label: "如何制作 Mod"
  },
  {
    key: "6",
    label: "竞速入门"
  }
];
</script>

<template>
  <div style="display: flex; width: 100%; height: 100%">
    <div
      style="
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      "
    >
      <BasicBlock style="width: 200px; height: 100%">
        <BasicNavItem
          v-for="item in schema"
          :name="item.key"
          :selected="currentKey === item.key"
          @clicked="currentKey = item.key"
        >
          <p
            style="
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
          >
            {{ item.label }}
          </p>
        </BasicNavItem>
      </BasicBlock>
    </div>
  </div>
</template>
