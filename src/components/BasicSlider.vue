<script setup lang="ts">
import { mapRange } from "@/utils/math";
import { computed, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    max?: number;
    min?: number;
    percentage?: boolean;
  }>(),
  {
    max: 1,
    min: 0
  }
);
const emits = defineEmits<{
  (event: "update:modelValue", value: number): void;
  (event: "dragEnd", value: number): void;
}>();

const slot = ref<HTMLElement>();

const minPos = -2;
const maxPos = 164;
const pos = ref(minPos);

const value = computed(() =>
  mapRange(pos.value, minPos, maxPos, props.min, props.max)
);

const isDragging = ref(false);
const offset = ref(0);
const onDragStart = (e: MouseEvent) => {
  isDragging.value = true;
  offset.value = pos.value - e.clientX;
  document.addEventListener("mousemove", onDragging);
  document.addEventListener("mouseup", onDragEnd);
};
const onDragging = (e: MouseEvent) => {
  if (isDragging.value) {
    pos.value = e.clientX + offset.value;
    if (pos.value < minPos) pos.value = minPos;
    if (pos.value > maxPos) pos.value = maxPos;
  }
};
const onDragEnd = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", onDragging);
  document.removeEventListener("mouseup", onDragEnd);
  emits("update:modelValue", value.value);
  emits("dragEnd", value.value);
};
onMounted(() => {
  pos.value = mapRange(props.modelValue, props.min, props.max, minPos, maxPos);
});
</script>

<template>
  <div class="basic-slider-container">
    <p v-if="!percentage" class="light">
      {{ value.toFixed(1) }}
    </p>
    <p v-else class="light">{{ Math.round(value * 100) }}%</p>
    <div ref="slot" class="basic-slider-slot">
      <div
        class="basic-slider-button"
        :style="{ left: pos + 'px' }"
        @mousedown="onDragStart"
        @mousemove="onDragging"
        @mouseup="onDragEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.basic-slider-container {
  display: flex;
  gap: var(--d-margin);
  align-items: center;
  justify-content: end;

  width: var(--d-width-lg);
  margin-right: var(--d-margin);
}

.basic-slider-slot {
  /* Slot Specific Variables */
  height: 8px;
  border: 0.1px solid var(--color-prime);

  width: var(--d-width);
  min-width: var(--d-width);
  border-radius: var(--d-round);

  background-color: var(--box-background);
  box-shadow: var(--box-shadow-prime);
}

.basic-slider-button {
  position: relative;

  top: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;

  transition: 50ms;

  background-color: var(--color-prime);
  box-shadow: var(--box-shadow-prime);
}
</style>
