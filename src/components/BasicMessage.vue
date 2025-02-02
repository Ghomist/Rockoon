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
  width: 240px;
  height: 36px;
  padding: 10px;
  font-size: 14px;

  border-radius: 8px;
  background-color: white;
  box-shadow: 0 0 8px var(--color-prime-shadow);

  display: flex;
  align-items: center;
  justify-content: flex-start;
  pointer-events: none;
}
</style>
