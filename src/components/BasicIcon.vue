<script setup lang="ts">
defineProps<{
  icon: string;
  size?: "normal" | "small" | "large";
  color?: string;
}>();
</script>

<template>
  <span
    class="basic-icon"
    :class="`mgc_${icon.replace(new RegExp('-', 'g'), '_')}`"
    :style="{
      '--icon-size':
        size === 'large' ? '32px' : size === 'small' ? '20px' : '24px',
      '--icon-color': color ?? 'inherit'
    }"
  />
</template>

<style scoped>
.basic-icon {
  &::before {
    font-size: var(--icon-size);
    color: var(--icon-color);
  }
}
</style>
