<script setup lang="ts">
import { mapRange } from "@/utils/math";
import { computed, onMounted, ref } from "vue";

const props = defineProps({
  modelValue: { type: Number, required: true },
  max: { type: Number, default: () => 1 },
  min: { type: Number, default: () => 0 },
  percentage: Boolean
});
const emits = defineEmits(["update:modelValue", "dragEnd"]);

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
    <p
      v-if="!percentage"
      style="margin-top: -1px; color: var(--color-text-light)"
    >
      {{ value.toFixed(1) }}
    </p>
    <p v-else style="margin-top: -1px; color: var(--color-text-light)">
      {{ Math.round(value * 100) }}%
    </p>
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
  gap: 10px;
  align-items: center;
  justify-content: end;
  width: 240px;
  padding-right: 10px;
}

.basic-slider-slot {
  width: 180px;
  min-width: 180px;
  height: 8px;
  background-color: var(--box-background);
  border: 0.1px solid var(--color-prime);
  border-radius: 8px;
  box-shadow: 0 0 4px var(--color-prime-shadow);
}

.basic-slider-button {
  position: relative;

  /* transform: translateY(-50%); */
  top: -6px;
  width: 20px;
  height: 20px;
  background-color: var(--color-prime);
  border-radius: 50%;
  box-shadow: 0 0 4px var(--color-prime-shadow);
  transition: 50ms;
}
</style>
