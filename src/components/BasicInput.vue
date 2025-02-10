<script setup lang="ts">
import { shakeNode } from "@/utils/common";
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    dataType?: "string" | "number" | "decimal";
    disabled?: boolean;
    placeholder?: string;
    maxLen?: number;
    asciiOnly?: boolean;
    validator?: (value: string) => boolean;
  }>(),
  {
    dataType: "string",
    disabled: false,
    asciiOnly: false,
    maxLen: Infinity
  }
);
const emits = defineEmits(["update:modelValue"]);
const validators = computed(() => {
  const validators: ((value: string) => boolean)[] = [];

  // user's validator
  if (props.validator) validators.push(props.validator);

  // ascii-only validator
  if (props.asciiOnly)
    validators.push((value: string) => !!value.match(/^[\x00-\xFF]+$/));

  // data type validator
  if (props.dataType == "number")
    validators.push((value: string) => !!value.match(/^[0-9]+$/));
  if (props.dataType == "decimal")
    validators.push((value: string) => !!value.match(/^[0-9]+(\.[0-9]+)?$/));

  return validators;
});

const inputRef = ref<HTMLInputElement>();
const onClick = (e: MouseEvent) => {
  if (props.disabled) (e.currentTarget as HTMLInputElement).select();
};
const onInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const value = target.value;

  // validate
  const valid = validators.value.every(validator => {
    if (!validator(value)) {
      // reset value
      target.value = props.modelValue?.toString() ?? "";
      shakeNode(inputRef.value!);
      return false;
    }
    return true;
  });
  if (!valid) {
    return;
  }

  // parse value & emit
  let emitValue: string | number | null = null;
  if (props.dataType === "number") {
    emitValue = Number.parseInt(value);
  } else if (props.dataType === "decimal") {
    emitValue = Number.parseFloat(value);
  } else if (props.dataType === "string") {
    emitValue = value;
  }
  emits("update:modelValue", emitValue);

  // ensure number format
  target.value = (emitValue ?? "").toString();
};
</script>

<template>
  <input
    class="basic-input anim"
    ref="inputRef"
    :placeholder="placeholder ?? '未设置'"
    :value="modelValue"
    :disabled="disabled"
    @click="onClick"
    @input="onInput"
  />
</template>

<style scoped>
.basic-input {
  text-align: right;

  width: var(--d-width-lg);
  min-width: none;
  border: none;
  background-color: transparent;

  &:hover {
    box-shadow: var(--input-shadow-hover);
  }

  &:focus {
    background-color: var(--input-bg-focus);
    box-shadow: var(--input-shadow-focus);
  }
}
</style>
