<template>
  <button class="basic-button">
    <slot></slot>
  </button>
</template>

<style scoped>
.basic-button {
  padding: 4px 8px;
  margin: 4px;
  color: var(--color-text-invert);
  background-color: var(--color-prime);
  border: 0;
  border-radius: 4px;
  box-shadow: 0 0 10px var(--color-prime-shadow);
  transition: 200ms;
  cursor: pointer;

  &:hover {
    background-color: var(--color-prime-hover);
  }

  &:active {
    background-color: var(--color-prime-click);
  }
}
</style>
