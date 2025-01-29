<script setup lang="ts">
defineProps({
  title: { type: String, required: true },
  tooltip: String
});
</script>

<template>
  <div class="basic-config">
    <div class="basic-config-prop">
      <p class="basic-config-label">{{ title }}</p>
      <p
        class="basic-config-tooltip"
        v-if="tooltip"
        style="
          margin-left: 4px;
          font-size: 14px;
          color: var(--color-text-light);
        "
      >
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
  height: 36px;
  min-height: 36px;
  max-height: 36px;
  padding: 2px 0;
  margin: 0 10px;

  /* font-size: 15px; */
}

.basic-config-prop {
  display: flex;
  gap: 2px;
  align-items: center;

  /* font-size: 14px; */
  .basic-config-label,
  .basic-config-tooltip {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.basic-config-slot {
  display: flex;
  gap: 2px;
  align-items: center;
  min-width: fit-content;
}
</style>
