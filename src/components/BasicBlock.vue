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
  padding: 10px;
  margin: 10px;
  overflow-x: hidden;
  background-color: var(--box-background);
  border-radius: 8px;
  box-shadow: var(--box-shadow);

  /* filter: drop-shadow(0 0 32px rgba(255, 255, 255, 0.6)); */
}
</style>
