<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "@lucide/vue";
import { onMounted, onUnmounted, ref } from "vue";

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
let unlisten: (() => void) | undefined;

onMounted(async () => {
  isMaximized.value = await appWindow.isMaximized();
  unlisten = await appWindow.onResized(() => {
    appWindow.isMaximized().then(v => (isMaximized.value = v));
  });
});

onUnmounted(() => unlisten?.());

const onMin = () => appWindow.minimize();
const onMax = () => appWindow.toggleMaximize();
const onClose = () => appWindow.close();
</script>

<template>
  <div class="flex shrink-0 items-stretch">
    <button
      type="button"
      class="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="minimize"
      @click="onMin"
    >
      <Minus class="size-4" />
    </button>
    <button
      type="button"
      class="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="maximize"
      @click="onMax"
    >
      <Copy v-if="isMaximized" class="size-3.5" />
      <Square v-else class="size-3.5" />
    </button>
    <button
      type="button"
      class="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
      aria-label="close"
      @click="onClose"
    >
      <X class="size-4" />
    </button>
  </div>
</template>
