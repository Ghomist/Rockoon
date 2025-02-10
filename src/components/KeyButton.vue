<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import BasicButton from "./BasicButton.vue";
import { sendMessage } from "@/utils/message";

const props = defineProps<{
  modelValue: string;
}>();
const keycode = computed(() => parseInt(props.modelValue));
const emits = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

/** CKKey 映射
 * 参见：https://github.com/doyaGu/Virtools-SDK-2.1/blob/main/Include/CKEnums.h#L1495 */
const ckKeyMapping: { name: string; code: number }[] = [
  { name: "Escape", code: 0x01 },
  { name: "Digit1", code: 0x02 },
  { name: "Digit2", code: 0x03 },
  { name: "Digit3", code: 0x04 },
  { name: "Digit4", code: 0x05 },
  { name: "Digit5", code: 0x06 },
  { name: "Digit6", code: 0x07 },
  { name: "Digit7", code: 0x08 },
  { name: "Digit8", code: 0x09 },
  { name: "Digit9", code: 0x0a },
  { name: "Digit0", code: 0x0b },
  { name: "Minus", code: 0x0c },
  { name: "Equal", code: 0x0d },
  { name: "Backspace", code: 0x0e },
  { name: "Tab", code: 0x0f },
  { name: "KeyQ", code: 0x10 },
  { name: "KeyW", code: 0x11 },
  { name: "KeyE", code: 0x12 },
  { name: "KeyR", code: 0x13 },
  { name: "KeyT", code: 0x14 },
  { name: "KeyY", code: 0x15 },
  { name: "KeyU", code: 0x16 },
  { name: "KeyI", code: 0x17 },
  { name: "KeyO", code: 0x18 },
  { name: "KeyP", code: 0x19 },
  { name: "BracketLeft", code: 0x1a },
  { name: "BracketRight", code: 0x1b },
  { name: "Enter", code: 0x1c },
  { name: "ControlLeft", code: 0x1d },
  { name: "KeyA", code: 0x1e },
  { name: "KeyS", code: 0x1f },
  { name: "KeyD", code: 0x20 },
  { name: "KeyF", code: 0x21 },
  { name: "KeyG", code: 0x22 },
  { name: "KeyH", code: 0x23 },
  { name: "KeyJ", code: 0x24 },
  { name: "KeyK", code: 0x25 },
  { name: "KeyL", code: 0x26 },
  { name: "Semicolon", code: 0x27 },
  { name: "Quote", code: 0x28 },
  { name: "Backquote", code: 0x29 },
  { name: "ShiftLeft", code: 0x2a },
  { name: "Backslash", code: 0x2b },
  { name: "KeyZ", code: 0x2c },
  { name: "KeyX", code: 0x2d },
  { name: "KeyC", code: 0x2e },
  { name: "KeyV", code: 0x2f },
  { name: "KeyB", code: 0x30 },
  { name: "KeyN", code: 0x31 },
  { name: "KeyM", code: 0x32 },
  { name: "Comma", code: 0x33 },
  { name: "Period", code: 0x34 },
  { name: "Slash", code: 0x35 },
  { name: "ShiftRight", code: 0x36 },
  { name: "NumpadMultiply", code: 0x37 },
  { name: "AltLeft", code: 0x38 },
  { name: "Space", code: 0x39 },
  { name: "CapsLock", code: 0x3a },
  { name: "F1", code: 0x3b },
  { name: "F2", code: 0x3c },
  { name: "F3", code: 0x3d },
  { name: "F4", code: 0x3e },
  { name: "F5", code: 0x3f },
  { name: "F6", code: 0x40 },
  { name: "F7", code: 0x41 },
  { name: "F8", code: 0x42 },
  { name: "F9", code: 0x43 },
  { name: "F10", code: 0x44 },
  { name: "NumLock", code: 0x45 },
  { name: "ScrollLock", code: 0x46 },
  { name: "Numpad7", code: 0x47 },
  { name: "Numpad8", code: 0x48 },
  { name: "Numpad9", code: 0x49 },
  { name: "NumpadSubtract", code: 0x4a },
  { name: "Numpad4", code: 0x4b },
  { name: "Numpad5", code: 0x4c },
  { name: "Numpad6", code: 0x4d },
  { name: "NumpadAdd", code: 0x4e },
  { name: "Numpad1", code: 0x4f },
  { name: "Numpad2", code: 0x50 },
  { name: "Numpad3", code: 0x51 },
  { name: "Numpad0", code: 0x52 },
  { name: "NumpadDecimal", code: 0x53 },
  { name: "F11", code: 0x57 },
  { name: "F12", code: 0x58 },
  { name: "F13", code: 0x64 },
  { name: "F14", code: 0x65 },
  { name: "F15", code: 0x66 },
  { name: "KanaMode", code: 0x70 },
  { name: "Convert", code: 0x79 },
  { name: "NonConvert", code: 0x7b },
  { name: "IntlYen", code: 0x7d },
  { name: "NumpadEqual", code: 0x8d },
  { name: "NumpadEnter", code: 0x9c },
  { name: "ControlRight", code: 0x9d },
  { name: "NumpadComma", code: 0xb3 },
  { name: "NumpadDivide", code: 0xb5 },
  { name: "PrintScreen", code: 0xb7 },
  { name: "AltRight", code: 0xb8 },
  { name: "Home", code: 0xc7 },
  { name: "ArrowUp", code: 0xc8 },
  { name: "PageUp", code: 0xc9 },
  { name: "ArrowLeft", code: 0xcb },
  { name: "ArrowRight", code: 0xcd },
  { name: "End", code: 0xcf },
  { name: "ArrowDown", code: 0xd0 },
  { name: "PageDown", code: 0xd1 },
  { name: "Insert", code: 0xd2 },
  { name: "Delete", code: 0xd3 },
  { name: "MetaLeft", code: 0xdb },
  { name: "MetaRight", code: 0xdc },
  { name: "ContextMenu", code: 0xdd },
  { name: "Lang2", code: 0x94 }
];

const keyboardEventToCkKey = (event: KeyboardEvent) =>
  ckKeyMapping.find(x => x.name === event.code)?.code;
const getCkKeyName = (key: number) =>
  ckKeyMapping.find(x => x.code === key)?.name ?? `Key-${key}`;

const keyButton = ref<InstanceType<typeof BasicButton>>();
const waitingInput = ref(false);
const onClick = () => {
  waitingInput.value = true;
};
const onKeyDown = (event: KeyboardEvent) => {
  if (waitingInput.value) {
    waitingInput.value = false;
    const key = keyboardEventToCkKey(event);
    if (key !== undefined) {
      emits("update:modelValue", key.toString());
    } else {
      sendMessage("该按键在 Ballance 中不可用");
    }
  }
};
const onBlur = () => (waitingInput.value = false);
onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  keyButton.value?.$el.addEventListener("blur", onBlur);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  keyButton.value?.$el.removeEventListener("blur", onBlur);
});
</script>

<template>
  <BasicButton ref="keyButton" tabindex="-1" @click="onClick">
    {{ waitingInput ? "请输入" : getCkKeyName(keycode) }}
  </BasicButton>
</template>
