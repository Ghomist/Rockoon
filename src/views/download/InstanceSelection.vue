<script setup lang="ts">
import BasicNavItem from "@/components/BasicNavItem.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { ref } from "vue";

defineProps<{
  tip?: string;
}>();

const app = useAppStore();
const fs = useFileStore();
const selected = ref(app.selected?.path);

defineExpose({ selectedPath: selected.value });
</script>

<template>
  <template v-if="fs.instances.length">
    <p v-if="tip">{{ tip }}</p>
    <BasicNavItem
      v-for="x in fs.instances"
      :name="x.path"
      :selected="selected === x.path"
      @clicked="selected = x.path"
    >
      {{ x.name }}
    </BasicNavItem>
  </template>
  <p v-else>需要先安装游戏才能下载！</p>
</template>
