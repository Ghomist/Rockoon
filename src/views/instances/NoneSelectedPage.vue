<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  tips: string[] | string;
}>();
const tipList = computed(() =>
  Array.isArray(props.tips) ? props.tips : [props.tips]
);
</script>

<template>
  <div class="container">
    <div v-for="tip in tipList">{{ tip }}</div>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 100%;
  width: 100%;

  color: gray;
}
</style>
