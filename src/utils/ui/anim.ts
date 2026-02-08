export const shakeNode = (node: HTMLElement) => {
  node.classList.add("shake-effect");
  setTimeout(() => node.classList.remove("shake-effect"), 300);
};
