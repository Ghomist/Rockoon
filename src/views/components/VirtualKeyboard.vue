<script setup lang="ts">
import { message } from "@/utils/ui/feedback";
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
    class="outline-none"
    @blur="focusHook?.focus()"
    @keydown.stop.prevent="onKeyDown"
  />

  <p class="text-sm text-muted-foreground">
    {{ t("common.key.changeKeyTip") }}
  </p>

  <div
    v-for="(line, index) in keySchema"
    :key="index"
    class="flex items-center"
  >
    <button
      v-for="k in line"
      :key="k.id"
      type="button"
      :class="[
        'inline-flex h-9 items-center justify-center border border-r-0 last:border-r px-2 text-sm transition-colors',
        'last:rounded-r-md first:rounded-l-md',
        modelValue === k.id
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background hover:bg-accent hover:text-accent-foreground',
        k.disabled && 'pointer-events-none opacity-50'
      ]"
      :style="{ width: `${(k.width ?? 1) * 36}px` }"
      :disabled="k.disabled"
      @click="$emit('update:modelValue', k.id)"
    >
      {{ k.display ?? k.name }}
    </button>
  </div>
</template>
