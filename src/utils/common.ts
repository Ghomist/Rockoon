export const watchNode = (
  node: HTMLElement,
  callback: MutationCallback
): MutationObserver => {
  const observer = new MutationObserver(callback);
  observer.observe(node, { attributes: true, childList: true, subtree: true });
  return observer;
};

export const withDefault = <T>(obj: any, dft: T) => ({ ...dft, ...obj }) as T;

export const shakeNode = (node: HTMLElement) => {
  node.classList.add("shake-effect");
  setTimeout(() => node.classList.remove("shake-effect"), 300);
};

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const debounce = (func: Function, wait: number = 300) => {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = window.setTimeout(later, wait);
  };
};
