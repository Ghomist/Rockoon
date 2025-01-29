<script setup lang="ts">
defineProps({
  name: { type: String, required: true },
  selected: Boolean
});

const emits = defineEmits<{
  (event: "clicked", name: string): void;
}>();
</script>

<template>
  <div
    class="basic-list-item"
    :style="{
      color: selected ? 'var(--color-prime-invert)' : 'var(--color-prime)',
      backgroundColor: selected ? 'var(--color-prime)' : 'transparent',
      boxShadow: selected ? '0 0 8px var(--color-prime-shadow)' : ''
    }"
    @click.prevent="emits('clicked', name)"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.basic-list-item {
  width: 90%;

  /* border-bottom: 1px solid rgba(0, 0, 0, 0.5); */
  padding: 8px 12px;
  border-radius: 8px;

  display: flex;
  align-items: center;
  gap: 4px;

  cursor: pointer;

  &:hover {
    box-shadow: inset 0 0 6px var(--color-prime-shadow);
  }

  /* &:active {
    box-shadow: 0 0 6px var(--color-prime-shadow);
    background-color: var(--color-prime);
    color: white;
  } */
}
</style>
