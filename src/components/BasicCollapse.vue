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
  (event: "expand"): void;
}>();

const content = ref<HTMLDivElement>();
const contentHeight = ref("0px");
const expand = ref(props.open);
const onClick = () => {
  expand.value = !expand.value;
  if (expand.value) emits("expand");
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
  if (props.open) emits("expand");
});

defineExpose({
  resize: updateHeight
});
</script>

<template>
  <BasicBlock style="overflow: hidden">
    <div class="basic-collapse-title anim" @click.prevent="onClick">
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
      ref="content"
      class="basic-collapse-content anim"
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
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: space-between;

  width: 100%;

  color: var(--color-prime);
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
