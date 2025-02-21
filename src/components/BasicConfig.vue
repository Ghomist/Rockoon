<script setup lang="ts">
defineProps<{
  title: string;
  tooltip?: string;
}>();
</script>

<template>
  <div class="basic-config">
    <div class="basic-config-prop">
      <p class="basic-config-label">{{ title }}</p>
      <p class="basic-config-tooltip light" v-html="tooltip" />
    </div>
    <div class="basic-config-slot">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.basic-config {
  display: flex;
  align-items: center;
  justify-content: space-between;

  height: var(--d-height);
  min-height: var(--d-height);
  max-height: var(--d-height);
  margin-left: var(--d-margin);
}

.basic-config-prop {
  display: flex;
  flex: 1;
  max-width: 80%;
  align-items: center;
  gap: var(--d-margin-xs);

  .basic-config-label,
  .basic-config-tooltip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .basic-config-tooltip {
    flex: 1;
    min-width: var(--d-margin-xs);
    margin-left: var(--d-margin-sm);
  }
}

.basic-config-slot {
  display: flex;
  gap: 2px;
  align-items: center;
  min-width: fit-content;
}
</style>
