<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect, WatchHandle } from "vue";

const props = defineProps<{
  name: string;
  selected?: boolean;
  autoScroll?: boolean;
}>();

const emits = defineEmits<{
  (event: "clicked", name: string): void;
}>();

const elRef = ref<HTMLElement>();

const autoScroll = () => {
  if (props.autoScroll && elRef.value && props.selected) {
    elRef.value.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
};

let watchHandle: WatchHandle;
onMounted(() => (watchHandle = watchEffect(autoScroll)));
onUnmounted(() => watchHandle?.stop());
</script>

<template>
  <div
    ref="elRef"
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
