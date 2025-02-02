<script setup lang="ts">
defineProps<{
  name: string;
  selected?: boolean;
}>();

const emits = defineEmits<{
  (event: "clicked", name: string): void;
}>();
</script>

<template>
  <div
    class="basic-list-item"
    :class="{ selected }"
    @click.prevent="emits('clicked', name)"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.basic-list-item {
  cursor: pointer;

  display: flex;
  align-items: center;
  width: 90%;

  gap: var(--d-margin-sm);
  padding: var(--d-padding-lg);
  border-radius: var(--d-round);

  color: var(--color-prime);
  background-color: transparent;

  &:hover {
    box-shadow: var(--box-shadow-prime-inset);
  }
  &.selected {
    color: var(--color-prime-invert);
    background-color: var(--color-prime);
    box-shadow: var(--box-shadow-prime);
  }
}
</style>
