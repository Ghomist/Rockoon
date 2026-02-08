export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const withDefault = <T>(obj: any, dft: T) => ({ ...dft, ...obj }) as T;

export const withDebounce = (func: (...args: any[]) => void, wait = 300) => {
  let timeout: number;
  return (...args: any[]) => {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = window.setTimeout(later, wait);
  };
};

export const withCache = <R>(func: () => R | Promise<R>, expireMs = 0) => {
  const cache: {
    value?: R;
    timestamp: number;
  } = {
    value: undefined,
    timestamp: 0
  };

  return async () => {
    if (cache.value === undefined || cache.timestamp + expireMs < Date.now()) {
      cache.value = await Promise.resolve(func());
      cache.timestamp = Date.now();
    }
    return cache.value;
  };
};

export const defineService = <R>(func: () => R) => {
  const instance = func();
  return () => instance;
};
