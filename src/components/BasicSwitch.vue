<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue?: boolean | string | number;
}>();
const emits = defineEmits(["update:modelValue", "toggled"]);

const value = computed(() => {
  if (typeof props.modelValue === "boolean") {
    return props.modelValue;
  } else if (typeof props.modelValue === "string") {
    return props.modelValue !== "0" && props.modelValue !== "";
  } else if (typeof props.modelValue === "number") {
    return props.modelValue !== 0;
  } else {
    return false;
  }
});

const emit = () => {
  const v = !value.value;
  if (typeof props.modelValue === "boolean") {
    emits("update:modelValue", v);
    emits("toggled", v);
  } else if (typeof props.modelValue === "string") {
    const e = v ? "1" : "0";
    emits("update:modelValue", e);
    emits("toggled", e);
  } else if (typeof props.modelValue === "number") {
    const e = v ? 1 : 0;
    emits("update:modelValue", e);
    emits("toggled", e);
  } else {
    const e = v ? "1" : "0";
    emits("update:modelValue", e);
    emits("toggled", e);
  }
};
</script>

<template>
  <div class="basic-switch-container" @click="emit">
    <div
      class="basic-switch-slot"
      :style="{
        backgroundColor: value
          ? 'var(--color-prime-transp)'
          : 'var(--box-background)'
      }"
    >
      <div
        class="basic-switch-btn"
        :style="{
          left: value ? '12px' : '-2px',
          backgroundColor: value
            ? 'var(--color-prime)'
            : 'var(--color-prime-lighter)'
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.basic-switch-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 24px;
  margin: 4px;
}

.basic-switch-slot {
  width: 30px;
  height: 12px;
  overflow: visible;
  border: 0.1px solid var(--color-prime);
  border-radius: 8px;
  box-shadow: 0 0 4px var(--color-prime-shadow);
}

.basic-switch-btn {
  position: relative;
  top: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 0 4px var(--color-prime-shadow);
}

.basic-switch-btn:hover {
  box-shadow: 0 0 16px var(--color-prime-shadow);
}
</style>
