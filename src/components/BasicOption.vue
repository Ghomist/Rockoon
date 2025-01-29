<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  schema: {
    value: string;
    label: string;
  }[];
}>();
defineEmits<{
  (event: "select", value: string): void;
}>();

const show = ref(false);
</script>

<template>
  <div
    class="option-wrapper"
    tabindex="0"
    @click="show = !show"
    @blur="show = false"
  >
    <slot></slot>
    <Transition name="expand">
      <div v-if="show" class="option-popup">
        <div class="option-item">
          <div v-for="item in schema" @click="$emit('select', item.value)">
            {{ item.label }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.option-wrapper {
  position: relative;
  height: auto;
  width: 100%;
}
.option-popup {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  height: 200px;
  background-color: var(--color-prime);
  border-radius: 4px;
  box-shadow: 0 0 10px var(--color-prime-shadow);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
</style>
