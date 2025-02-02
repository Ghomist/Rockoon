<script setup lang="ts">
import BasicIcon from "./BasicIcon.vue";

defineProps<{
  type: HintType;
  message: string;
}>();
</script>

<template>
  <div class="basic-message-container">
    <BasicIcon :icon="type" />
    {{ message }}
  </div>
</template>

<style scoped>
.basic-message-container {
  width: var(--d-width-lg);
  height: var(--d-height);
  padding: var(--d-padding);
  font-size: var(--text-sm);

  border-radius: var(--d-round);
  background-color: var(--box-background);
  box-shadow: var(--box-shadow-dark);

  display: flex;
  align-items: center;
  justify-content: flex-start;
  pointer-events: none;
}
</style>
