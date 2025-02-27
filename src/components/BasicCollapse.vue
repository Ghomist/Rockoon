<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import BasicBlock from "./BasicBlock.vue";
import BasicIcon from "./BasicIcon.vue";

const props = withDefaults(
  defineProps<{
    title: string;
    summary?: string;
    open?: boolean;
    empty?: string;
  }>(),
  {
    open: false,
    empty: "内容为空"
  }
);

const emits = defineEmits<{
  (event: "expand"): void;
}>();

const contentRef = ref<HTMLDivElement>();
const contentHeight = ref("0px");
const expand = ref(props.open);
const onClick = () => {
  expand.value = !expand.value;
  if (expand.value) emits("expand");
};

const updateHeight = () => {
  const contentEl = contentRef.value!;
  const children = Array.from(contentEl.children);
  let height;
  if (children.length < 50) {
    height = children.reduce(
      (acc, el) => acc + (el as HTMLElement).offsetHeight,
      0
    );
  } else {
    height = children.length * (children[0] as HTMLElement).offsetHeight;
  }
  contentHeight.value = `${height}px`;
};

let observer: MutationObserver | null = null;
onMounted(() => {
  observer = new MutationObserver(updateHeight);
  observer.observe(contentRef.value!, { childList: true });
  updateHeight();
  if (props.open) emits("expand");
});
onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <BasicBlock style="overflow: hidden">
    <div class="basic-collapse-title" @click.prevent="onClick">
      <div>
        <span
          style="
            padding-left: var(--d-margin);
            margin-right: var(--d-margin-sm);
            color: var(--color-prime);
          "
        >
          {{ title }}
        </span>
        <span style="color: var(--color-ignore); opacity: 0.6">
          {{ summary }}
        </span>
      </div>

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
      ref="contentRef"
      class="basic-collapse-content anim"
      :style="{
        height: expand ? contentHeight : '0px',
        paddingTop: expand ? '8px' : '0px'
      }"
    >
      <template v-if="expand">
        <slot></slot>
      </template>
    </div>
    <p class="light" v-if="expand && contentHeight === '0px'">{{ empty }}</p>
  </BasicBlock>
</template>

<style scoped>
.basic-collapse-title {
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: space-between;

  width: 100%;

  color: var(--color-prime);
}
.basic-collapse-title * {
  cursor: pointer;
}

.basic-collapse-buttons {
  display: flex;
  align-items: center;

  gap: var(--d-margin);
}

.basic-collapse-content {
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
