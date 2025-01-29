<template>
  <div class="basic-list-item-container">
    <slot name="left"></slot>
    <slot name="right"></slot>
  </div>
</template>

<style scoped>
.basic-list-item-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  min-height: 36px;
  max-height: 36px;
  margin: 0 10px;
}
</style>
