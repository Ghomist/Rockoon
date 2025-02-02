<script setup lang="ts">
import { computed } from "vue";
import BasicIcon from "@/components/BasicIcon.vue";
import { useAppStore } from "@/stores/app";

const props = defineProps<{
  page?: PageId;
  content?: string;
  icon?: string;
  action?: () => void;
}>();

const app = useAppStore();
const selected = computed(() => app.page === props.page);

const onClick = () => {
  if (props.action) props.action();
  if (props.page) app.page = props.page;
};
</script>

<template>
  <div
    class="header-button"
    :class="{ selected, icon: !content }"
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
  padding: var(--d-padding-lg);
  text-align: center;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-prime-invert);
  background: transparent;

  &:hover {
    box-shadow: inset 0 0 4px rgba(white, 0.6);
  }
  &.selected {
    font-weight: 500;
    color: var(--color-prime);
    background: var(--color-prime-invert);
    box-shadow: var(--box-shadow);
  }
  &.icon {
    padding: var(--d-padding-sm);
    &:hover {
      box-shadow: none;
    }
  }
}
</style>
