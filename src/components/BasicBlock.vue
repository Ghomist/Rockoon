<template>
  <div class="basic-block">
    <slot></slot>
  </div>
</template>

<style scoped>
.basic-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;

  overflow-x: hidden;

  padding: var(--d-padding);
  margin: var(--d-margin);
  border-radius: var(--d-round);

  box-shadow: var(--box-shadow);
  background-color: var(--box-background);
}
</style>
