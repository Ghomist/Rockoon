<script setup lang="ts">
import { onMounted, ref } from "vue";
import BasicBlock from "./BasicBlock.vue";
import BasicIcon from "./BasicIcon.vue";

defineProps<{
  type?: string;
  header?: string;
  content?: string;
}>();

const show = ref(false);
onMounted(() => {
  show.value = true;
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="basic-dialog-mask" @click="show = false">
      <BasicBlock class="basic-dialog-container" @click.stop>
        <h style="height: 16px; margin-bottom: 10px">
          <BasicIcon
            :icon="type === 'info' ? 'information-line' : 'warning-line'"
            width="18px"
          />
          {{ header || type?.toUpperCase() }}
        </h>
        <div class="basic-dialog-content">
          <p v-if="content">{{ content }}</p>
          <div v-else>
            <slot></slot>
          </div>
        </div>
      </BasicBlock>
    </div>
  </Transition>
</template>

<style scoped>
.basic-dialog-mask {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background-color: rgb(0 0 0 / 35%);
}

.basic-dialog-container {
  justify-content: center;
  padding: 12px;
  background-color: white;
}

.basic-dialog-content {
  min-width: 240px;
  min-height: 100px;
  padding: 10px;
  margin: 5px;
  border-radius: 4px;

  /* border: 1px solid var(--color-prime); */
  /* box-shadow: inset 0 0 10px var(--color-prime-transp); */
}
</style>
