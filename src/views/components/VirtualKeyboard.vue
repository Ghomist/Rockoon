<script setup lang="ts">
import { message } from "@/utils/ui/feedback";
import { NButton, NText } from "naive-ui";
import { onMounted, ref } from "vue";
import { getKeyByPhysicCode, keySchema } from "./key";

const { t } = defineProps<{
  t: (key: string) => string;
  modelValue: number;
}>();
const emits = defineEmits<{
  (event: "update:modelValue", value: number): void;
}>();

const focusHook = ref<HTMLElement>();

const onKeyDown = (e: KeyboardEvent) => {
  const key = getKeyByPhysicCode(e.code);
  if (key !== undefined) emits("update:modelValue", key);
  else message.warning(t("common.key.unavailableKey"));
};
onMounted(() => {
  focusHook.value?.focus();
});
</script>

<template>
  <div
    ref="focusHook"
    tabindex="0"
    @blur="focusHook?.focus()"
    @keydown.stop.prevent="onKeyDown"
  />

  <n-text>
    {{ t("common.key.changeKeyTip") }}
  </n-text>

  <div
    v-for="(line, index) in keySchema"
    :key="index"
    class="virtual-keyboard-line"
  >
    <n-button
      v-for="k in line"
      :key="k.id"
      :type="modelValue == k.id ? 'primary' : 'default'"
      :style="{ width: `${(k.width ?? 1) * 36}px` }"
      :disabled="k.disabled"
      @click="$emit('update:modelValue', k.id)"
    >
      {{ k.display ?? k.name }}
    </n-button>
  </div>
</template>

<style scoped>
.virtual-keyboard-line {
  display: flex;
  align-items: center;

  * {
    height: 36px;
    margin: 0;
    text-wrap: none;
    white-space: nowrap;
    border-radius: 0;
  }
}
</style>
