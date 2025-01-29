<script setup lang="ts">
defineProps({
  icon: { type: String, required: true },
  width: String,
  color: String
});
</script>

<template>
  <span
    class="basic-icon"
    :class="`mgc_${icon.replace(new RegExp('-', 'g'), '_')}`"
    :style="{
      '--icon-size': width ?? '20px',
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
