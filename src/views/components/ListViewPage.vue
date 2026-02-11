<script setup lang="ts">
import { NFlex, NList, NScrollbar } from "naive-ui";
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

    <n-scrollbar class="list-container-fix list-item-fix">
      <slot />
    </n-scrollbar>
  </n-list>
</template>
