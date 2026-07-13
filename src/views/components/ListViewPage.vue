<script setup lang="ts">
const emit = defineEmits<{
  scroll: [e: Event];
}>();
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      class="flex items-center justify-between gap-3 border-b px-4 py-2.5"
    >
      <p class="truncate text-sm font-medium">
        <slot name="title" />
      </p>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div class="flex-1 overflow-auto" @scroll="emit('scroll', $event)">
      <div class="divide-y">
        <slot />
      </div>
    </div>
  </div>
</template>
