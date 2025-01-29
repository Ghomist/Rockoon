<script setup lang="ts">
import SwitchButton from "@/components/SwitchButton.vue";
import { useAppStore } from "@/stores/app";
import { computed } from "vue";

const props = defineProps<{
  editing: BallanceKeyType | "all";
}>();

const app = useAppStore();
const options = computed(() => app.selected!.options);
const allBindKeys = computed(() =>
  Object.entries(options.value)
    .filter(([k, _]) => k.startsWith("key"))
    .map(([_, v]) => v as number)
);
const editingBindKey = computed(() =>
  props.editing !== "all" ? options.value[props.editing] : -1
);

interface KeyProps {
  id: number;
  name: string;
  display?: string;
  width?: number;
  disabled?: boolean;
}

const keySchema: KeyProps[][] = [
  [
    { id: 38, name: "`" },
    { id: 0, name: "1" },
    { id: 1, name: "2" },
    { id: 2, name: "3" },
    { id: 3, name: "4" },
    { id: 4, name: "5" },
    { id: 5, name: "6" },
    { id: 6, name: "7" },
    { id: 7, name: "8" },
    { id: 8, name: "9" },
    { id: 9, name: "0" },
    { id: 10, name: "-" },
    { id: 11, name: "=" },
    { id: 12, name: "BackSpace", display: "BKSP", width: 107 },
    { id: 66, name: "Num Del", display: "Del", width: 48 },
    { id: 61, name: "Num +", display: "+" },
    { id: 57, name: "Num -", display: "-" }
  ],
  [
    { id: 13, name: "Tab", width: 60 },
    { id: 14, name: "Q" },
    { id: 15, name: "W" },
    { id: 16, name: "E" },
    { id: 17, name: "R" },
    { id: 18, name: "T" },
    { id: 19, name: "Y" },
    { id: 20, name: "U" },
    { id: 21, name: "I" },
    { id: 22, name: "O" },
    { id: 23, name: "P" },
    { id: 24, name: "[" },
    { id: 25, name: "]" },
    { id: 40, name: "\\", width: 100 },
    { id: 54, name: "Num 7", display: "7" },
    { id: 55, name: "Num 8", display: "8" },
    { id: 56, name: "Num 9", display: "9" }
  ],
  [
    { id: -1, name: "Caps", width: 80, disabled: true },
    { id: 27, name: "A" },
    { id: 28, name: "S" },
    { id: 29, name: "D" },
    { id: 30, name: "F" },
    { id: 31, name: "G" },
    { id: 32, name: "H" },
    { id: 33, name: "J" },
    { id: 34, name: "K" },
    { id: 35, name: "L" },
    { id: 36, name: ";" },
    { id: 37, name: "'" },
    { id: -1, name: "Enter", width: 120 },
    { id: 58, name: "Num 4", display: "4" },
    { id: 59, name: "Num 5", display: "5" },
    { id: 60, name: "Num 6", display: "6" }
  ],
  [
    { id: 39, name: "Shift", width: 100 },
    { id: 41, name: "Z" },
    { id: 42, name: "X" },
    { id: 43, name: "C" },
    { id: 44, name: "V" },
    { id: 45, name: "B" },
    { id: 46, name: "N" },
    { id: 47, name: "M" },
    { id: 48, name: "," },
    { id: 49, name: "." },
    { id: 50, name: "/" },
    { id: 51, name: "Right Shift", display: "R-Shift", width: 95 },
    { id: 68, name: "Up", display: "↑" },
    { id: 62, name: "Num 1", display: "1" },
    { id: 63, name: "Num 2", display: "2" },
    { id: 64, name: "Num 3", display: "3" }
  ],
  [
    { id: 26, name: "Ctrl", width: 65 },
    { id: 52, name: "Alt", width: 65 },
    { id: 53, name: "Space", width: 410 },
    { id: 70, name: "Left", display: "←" },
    { id: 69, name: "Down", display: "↓" },
    { id: 71, name: "Right", display: "→" },
    { id: 65, name: "Num 0", display: "0", width: 76 }
  ]
];

const onClick = (key: number) => {
  if (props.editing === "all") return;
  options.value[props.editing] = key;
};
</script>

<template>
  <div class="virtual-keyboard-container">
    <div class="virtual-keyboard-main" style="">
      <div class="virtual-keyboard-line" v-for="line in keySchema">
        <SwitchButton
          v-for="x in line"
          :active="
            editing === 'all'
              ? allBindKeys.includes(x.id)
              : editingBindKey === x.id
          "
          :style="{ width: x.width + 'px' }"
          :disabled="x.disabled"
          @click="onClick(x.id)"
        >
          {{ x.display ?? x.name }}
        </SwitchButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-keyboard-line {
  display: flex;
  align-items: center;
  margin: 0.5% 0;
}
</style>
