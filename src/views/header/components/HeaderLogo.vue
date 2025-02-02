<script setup lang="ts">
import { useAppStore } from "@/stores/app";

const app = useAppStore();
</script>

<template>
  <p class="logo-text">
    {{ app.selected ? `当前游戏：${app.selectedName}` : "Ballance Launcher" }}
    <!-- Ballance Launcher -->
  </p>
</template>

<style scoped>
.logo-text {
  color: white;
  text-wrap: nowrap;
}
</style>
