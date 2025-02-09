<script setup lang="ts">
defineProps<{
  active?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <button
    class="switch-button"
    :class="{ active, disabled }"
    :disabled="disabled"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.switch-button {
  cursor: pointer;

  padding: var(--d-padding-md);
  margin: var(--d-margin-sm);
  border-radius: var(--d-round-sm);
  border: none;

  background-color: transparent;

  transition: all 200ms;

  &.active {
    box-shadow: var(--box-shadow-dark);
    color: var(--color-text-invert);
    background-color: var(--color-prime);
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
