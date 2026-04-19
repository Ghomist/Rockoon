import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";

const STORAGE_KEY = "rockoon-hub-token";

export const useHubStore = defineStore("hub", () => {
  const token = ref(localStorage.getItem(STORAGE_KEY) || "");
  const isAuthenticated = computed(() => !!token.value);

  function setToken(t: string) {
    token.value = t;
    localStorage.setItem(STORAGE_KEY, t);
  }

  function logout() {
    token.value = "";
    localStorage.removeItem(STORAGE_KEY);
  }

  function authHeaders(): Record<string, string> {
    if (!token.value) return {};
    return { Authorization: `Bearer ${token.value}` };
  }

  return { token, isAuthenticated, setToken, logout, authHeaders };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHubStore, import.meta.hot));
}
