<script setup lang="ts">
import { getKeyByPhysicCode, getKeyName, keySchema } from "@/utils/ballance";
import { onMounted, onUnmounted, ref } from "vue";
import SwitchButton from "./SwitchButton.vue";
import { sendMessage } from "@/utils/message";

defineProps<{
  modelValue: number;
}>();
const emits = defineEmits<{
  (event: "update:modelValue", value: number): void;
}>();

const tip = ref<HTMLElement>();

const onKeyDown = (e: KeyboardEvent) => {
  e.stopPropagation();
  e.preventDefault();
  const key = getKeyByPhysicCode(e.code);
  if (key !== undefined) emits("update:modelValue", key);
  else sendMessage("该按键在 Ballance 中不可用");
};
const keepFocus = () => tip.value?.focus();
onMounted(() => {
  tip.value?.focus();
  tip.value?.addEventListener("keydown", onKeyDown);
  tip.value?.addEventListener("blur", keepFocus);
});
onUnmounted(() => {
  tip.value?.removeEventListener("keydown", onKeyDown);
  tip.value?.removeEventListener("blur", keepFocus);
});
</script>

<template>
  <p ref="tip" class="virtual-keyboard-tip light" tabindex="0">
    按下键盘或单击下方的虚拟键盘按键以更改按键绑定 当前按键：
    <span style="color: var(--color-text-prime)">
      {{ getKeyName(modelValue) }}
    </span>
  </p>
  <div v-for="line in keySchema" class="virtual-keyboard-line">
    <SwitchButton
      v-for="k in line"
      :active="modelValue == k.id"
      :style="{ width: `${(k.width ?? 1) * 28}px` }"
      :disabled="k.disabled"
      @click="$emit('update:modelValue', k.id)"
    >
      {{ k.display ?? k.name }}
    </SwitchButton>
  </div>
</template>

<style scoped>
.virtual-keyboard-tip {
  outline: none;
}
.virtual-keyboard-line {
  display: flex;
  align-items: center;

  * {
    white-space: nowrap;
    text-wrap: none;
    height: 28px;
    margin: 0;
    border-radius: 0;
    border: 1px solid var(--color-prime-transp);
  }
}
</style>
