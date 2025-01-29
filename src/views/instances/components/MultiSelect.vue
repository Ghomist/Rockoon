<script setup lang="ts">
import { ref } from "vue";
import SwitchButton from "@/components/SwitchButton.vue";

const emits = defineEmits<{
  (event: "onKeyChange", key: BallanceKeyType | "all"): void;
}>();

const items: { name: string; key: BallanceKeyType | "all" }[] = [
  { name: "↑", key: "keyForward" },
  { name: "↓", key: "keyBackward" },
  { name: "←", key: "keyLeft" },
  { name: "→", key: "keyRight" },
  { name: "旋转视角", key: "keyRotateCam" },
  { name: "抬升视角", key: "keyLiftCam" },
  { name: "全部显示", key: "all" }
];

const selected = ref("all");
const onClick = (key: BallanceKeyType | "all") => {
  selected.value = key;
  emits("onKeyChange", key);
};
</script>

<template>
  <div class="multi-select-container">
    <SwitchButton
      v-for="i in items"
      style="padding: 0 8px; margin-left: 4px"
      :active="selected == i.key"
      @click="onClick(i.key)"
    >
      {{ i.name }}
    </SwitchButton>
  </div>
</template>

<style scoped>
.multi-select-container {
  display: flex;
}
</style>
