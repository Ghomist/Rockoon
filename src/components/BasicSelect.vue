<script setup lang="ts">
const props = defineProps({
  schema: {
    type: Array<{
      value: number;
      label: string;
    }>,
    required: true
  },
  selectedValue: { type: Number, required: true }
});
const emits = defineEmits<{
  (event: "onselect", value: number): void;
}>();

const onSelect = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value;
  const item = props.schema.find(x => x.value === parseInt(value));
  if (item) emits("onselect", item.value);
};
</script>

<template>
  <!-- <div>
    {{ schema[selectedValue].label }}
  </div> -->
  <select class="basic-select" @change="onSelect">
    <option
      class="basic-select-option"
      v-for="item in schema!"
      :value="item.value"
      :selected="item.value === selectedValue"
    >
      {{ item.label ?? item.value }}
    </option>
  </select>
</template>

<style scoped>
.basic-select {
  padding: 6px 10px;
  text-align: right;
  appearance: none;
  background: transparent;
  border: 0;

  &:hover {
    box-shadow: inset 0 0 2px var(--color-prime-shadow);
  }

  &:active {
    box-shadow: 0 0 10px var(--color-prime-shadow);
  }
}

.basic-select-option {
  background: none;

  &:hover {
    color: var(--color-prime-invert);
    background-color: var(--color-prime);
  }
}
</style>
