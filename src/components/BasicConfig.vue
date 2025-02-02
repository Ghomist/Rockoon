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
      <p class="basic-config-tooltip light" v-if="tooltip">
        {{ tooltip }}
      </p>
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
  gap: 2px;
  align-items: center;

  .basic-config-label,
  .basic-config-tooltip {
    /* max-width: 280px; */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .basic-config-tooltip {
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
