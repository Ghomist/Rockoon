<script setup lang="ts">
import BasicIcon from "@/components/BasicIcon.vue";

defineProps({
  schema: Array<{ icon: string; callback: () => void }>
});
</script>

<template>
  <div style="display: flex; gap: 8px; align-items: center">
    <BasicIcon
      v-for="i in schema"
      width="20px"
      style="cursor: pointer"
      :icon="i.icon"
      @click.stop="i.callback()"
    />
  </div>
</template>
