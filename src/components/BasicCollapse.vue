<script setup lang="ts">
import { onMounted, ref } from "vue";
import BasicBlock from "./BasicBlock.vue";
import BasicIcon from "./BasicIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: () => false },
  title: { type: String, required: true },
  summary: String
});

const emits = defineEmits<{
  (event: "onExpand"): void;
}>();

const content = ref<HTMLDivElement>();
const contentHeight = ref("0px");
const expand = ref(props.open);
const onClick = () => {
  expand.value = !expand.value;
  if (expand.value) emits("onExpand");
};

const updateHeight = () => {
  let height = 0;
  const cnt = content.value?.childElementCount ?? 0;
  for (let i = 0; i < cnt; ++i) {
    height += (content.value?.children[i] as HTMLElement).offsetHeight;
  }
  contentHeight.value = height + "px";
};

onMounted(() => {
  updateHeight();
  if (props.open) emits("onExpand");
});

defineExpose({
  resize: updateHeight
});
</script>

<template>
  <BasicBlock style="overflow: hidden">
    <div class="basic-collapse-title" @click.prevent="onClick">
      <span style="padding-left: 10px; margin: 0; color: var(--color-prime)">
        {{ title }}
        <span
          style="margin-left: 4px; color: var(--color-ignore); opacity: 0.6"
        >
          {{ summary }}
        </span>
      </span>

      <div class="basic-collapse-buttons">
        <Transition name="fade">
          <slot v-if="expand" name="buttons"></slot>
        </Transition>
        <div
          style="width: 24px; height: 24px"
          :style="{ transform: expand ? 'rotateZ(180deg)' : 'rotateZ(0deg)' }"
        >
          <BasicIcon icon="down-line" width="24px" />
        </div>
      </div>
    </div>
    <div
      ref="content"
      class="basic-collapse-content"
      :style="{
        height: expand ? contentHeight : '0px',
        opacity: expand ? 1 : 0,
        paddingTop: expand ? '8px' : '0px'
      }"
    >
      <slot></slot>
    </div>
  </BasicBlock>
</template>

<style scoped>
.basic-collapse-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  color: var(--color-prime);
  transition: all 250ms;
}

.basic-collapse-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.basic-collapse-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  transition: all 250ms;
}
</style>
