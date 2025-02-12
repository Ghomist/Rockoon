<script setup lang="ts">
import { onMounted, ref } from "vue";
import BasicBlock from "./BasicBlock.vue";
import BasicButton from "./BasicButton.vue";

withDefaults(
  defineProps<{
    title?: string;
    content?: string;
    footer?: boolean;
    sure?: boolean;
    cancel?: boolean;
    sureText?: string;
    cancelText?: string;
    lock?: boolean;
  }>(),
  {
    footer: true,
    sure: true,
    cancel: true,
    sureText: "确认",
    cancelText: "取消"
  }
);
const emits = defineEmits<{
  (event: "cancel"): void;
  (event: "sure"): void;
  (event: "close", sure: boolean): void;
  (event: "destroy"): void;
}>();

const show = ref(false);

const onCancel = () => {
  emits("cancel");
  emits("close", false);
  show.value = false;
  emits("destroy");
};
const onSure = () => {
  emits("sure");
  emits("close", true);
  show.value = false;
  emits("destroy");
};

onMounted(() => {
  show.value = true;
});
</script>

<template>
  <Transition name="fade">
    <div
      v-if="show"
      class="basic-dialog-mask"
      @click="lock ? undefined : onCancel"
    >
      <BasicBlock class="basic-dialog-container" @click.stop>
        <h v-if="title" class="basic-dialog-title">
          {{ title }}
        </h>
        <div class="basic-dialog-content">
          <div v-if="content" v-html="content" />
          <slot v-else></slot>
        </div>
        <div v-if="footer" class="basic-dialog-footer">
          <BasicButton v-if="sure" @click="onSure">
            {{ sureText }}
          </BasicButton>
          <BasicButton v-if="cancel" @click="onCancel">
            {{ cancelText }}
          </BasicButton>
        </div>
      </BasicBlock>
    </div>
  </Transition>
</template>

<style scoped>
.basic-dialog-mask {
  z-index: 100;

  position: fixed;
  inset: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

.basic-dialog-container {
  display: flex;
  flex-direction: column;
  align-items: start;

  max-width: 60%;
  max-height: 75%;

  padding: var(--d-padding);
  background-color: var(--box-background);
  box-shadow: var(--box-shadow-dark);
}

.basic-dialog-title {
  font-weight: bold;
  margin: var(--d-margin-sm);
  font-size: var(--text-lg);
}

.basic-dialog-content {
  max-height: 300px;
  overflow-y: scroll;
  min-width: var(--d-width-lg);
  margin: var(--d-margin-sm);
  margin-bottom: var(--d-margin);
}

.basic-dialog-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: end;
}
</style>
