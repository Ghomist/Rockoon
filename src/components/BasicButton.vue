<template>
  <button class="basic-button anim">
    <slot></slot>
  </button>
</template>

<style scoped>
.basic-button {
  cursor: pointer;

  padding: var(--d-padding-md);
  margin: var(--d-margin-sm);
  border-radius: var(--d-round-sm);
  border: none;

  color: var(--color-text-invert);
  background-color: var(--color-prime);
  box-shadow: var(--box-shadow-dark);

  &:hover {
    background-color: var(--color-prime-hover);
  }

  &:active {
    background-color: var(--color-prime-click);
  }
}
</style>
