<script setup lang="ts">
import { NFlex, NList, NScrollbar } from "naive-ui";

// 暴露滚动事件
const emit = defineEmits<{
  scroll: [e: Event];
}>();
</script>

<template>
  <n-list class="list-header-fix" hoverable clickable style="width: 100%">
    <template #header>
      <n-flex justify="space-between" align="center">
        <p>
          <slot name="title" />
        </p>
        <n-flex>
          <slot name="actions" />
        </n-flex>
      </n-flex>
    </template>

    <n-scrollbar
      class="list-container-fix list-item-fix"
      @scroll="emit('scroll', $event)"
    >
      <slot />
    </n-scrollbar>
  </n-list>
</template>
