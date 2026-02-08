<script setup lang="ts">
import { usePrefStore } from "@/stores/pref";
import { NFlex, NCard } from "naive-ui";

const pref = usePrefStore();

// 快速问题修复
// 数据统计（游玩时间，重开次数等）
</script>

<template>
  <n-flex vertical style="height: 100%">
    <n-flex style="flex: 1" :vertical="false">
      <n-card style="flex: 1"> AAAAAAAAAA </n-card>
      <n-card style="flex: 1"> BBBBBBBBB </n-card>
    </n-flex>
    <n-flex style="flex: 1">
      <n-card style="flex: 1"> AAAAAAAAAA </n-card>
      <n-card style="flex: 1"> BBBBBBBBB </n-card>
      <n-card style="flex: 1"> BBBBBBBBB </n-card>
    </n-flex>
  </n-flex>
</template>
