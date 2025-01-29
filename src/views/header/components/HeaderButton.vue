<script setup lang="ts">
import { computed } from "vue";
import BasicIcon from "@/components/BasicIcon.vue";
import { useAppStore } from "@/stores/app";

const props = defineProps<{
  page: PageId;
  content: string;
  icon?: string;
  action?: () => void;
}>();

const app = useAppStore();
const selected = computed(() => app.page === props.page);

const onClick = () => {
  if (props.action) {
    props.action();
  } else {
    app.page = props.page;
  }
};
</script>

<template>
  <div
    class="header-button"
    :style="{
      fontWeight: selected ? '500' : '',
      color: selected ? 'var(--color-prime)' : 'var(--color-prime-invert)',
      background: selected ? 'var(--color-prime-invert)' : 'transparent',
      boxShadow: selected ? 'var(--box-shadow)' : ''
    }"
    @click.prevent="onClick"
  >
    <BasicIcon v-if="icon" :icon="icon" />
    {{ content }}
  </div>
</template>

<style lang="scss" scoped>
.header-button {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px 18px;
  text-align: center;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    box-shadow: inset 0 0 4px rgba(white, 0.6);
  }
}
</style>
