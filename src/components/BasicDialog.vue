<script setup lang="ts">
import { onMounted, ref } from "vue";
import BasicBlock from "./BasicBlock.vue";
import BasicButton from "./BasicButton.vue";

withDefaults(
  defineProps<{
    title?: string;
    content?: string;
    footer?: boolean;
  }>(),
  {
    footer: true
  }
);
const emits = defineEmits<{
  (event: "cancel"): void;
  (event: "sure"): void;
}>();

const show = ref(false);

const onCancel = () => {
  emits("cancel");
  show.value = false;
};
const onSure = () => {
  emits("sure");
  show.value = false;
};

onMounted(() => {
  show.value = true;
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="basic-dialog-mask" @click="onCancel">
      <BasicBlock class="basic-dialog-container" @click.stop>
        <h v-if="title" class="basic-dialog-title">
          {{ title }}
        </h>
        <div class="basic-dialog-content">
          <p v-if="content">{{ content }}</p>
          <div v-else>
            <slot></slot>
          </div>
        </div>
        <div v-if="footer" class="basic-dialog-footer">
          <BasicButton @click="onSure">确认</BasicButton>
          <BasicButton @click="onCancel">取消</BasicButton>
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

  max-width: 50%;

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
  min-width: var(--d-width-lg);
  margin: var(--d-margin-sm);
  padding-bottom: var(--d-margin);
}

.basic-dialog-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: end;
}
</style>
