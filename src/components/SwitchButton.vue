<script setup lang="ts">
defineProps<{
  active?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <button
    class="virtual-key-button"
    :class="{ active, disabled }"
    :disabled="disabled"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.virtual-key-button {
  min-width: 36px;
  height: 36px;
  margin: 0.5px 1px;
  background-color: transparent;
  border: none;
  border-radius: 4px;
  box-shadow: var(--box-shadow-prime-inset);
  transition: all 100ms;

  &.active {
    color: var(--color-prime-invert);
    background-color: var(--color-prime);

    /* font-weight: bold; */
  }

  &:hover {
    color: var(--color-prime-invert);
    background-color: var(--color-prime-hover);
  }

  &:active {
    background-color: var(--color-prime-click);
  }

  &.disabled {
    color: var(--color-text-light);
    background-color: transparent;
  }
}
</style>
