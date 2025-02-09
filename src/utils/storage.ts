import { withDefault } from "./common";

function get<T>(key: string): T {
  return JSON.parse(localStorage.getItem(key) ?? "{}", (_, value) => {
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    ) {
      return new Date(value);
    }
    return value;
  });
}

function getWithDefault<T>(key: string, dft: T) {
  return withDefault(get<T>(key), dft);
}

function set(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string) {
  localStorage.removeItem(key);
}

function clear() {
  localStorage.clear();
}

export default {
  get,
  getWithDefault,
  set,
  remove,
  clear
};
