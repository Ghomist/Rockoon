<script setup lang="ts">
import { useHubStore } from "@/stores/hub";
import { login } from "@/services/hub";
import { message } from "@/utils/ui/feedback";
import { NButton, NFlex, NInput, NText } from "naive-ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "../components/ListViewPage.vue";

const { t } = useI18n();
const hub = useHubStore();

const password = ref("");
const loading = ref(false);

const onLogin = async () => {
  if (!password.value) return;
  loading.value = true;
  try {
    const token = await login(password.value);
    hub.setToken(token);
    message.success(t("hub.admin.loginSuccess"));
    password.value = "";
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  } finally {
    loading.value = false;
  }
};

const onLogout = () => {
  hub.logout();
  message.success(t("hub.admin.logoutSuccess"));
};
</script>

<template>
  <list-view-page>
    <template #title>
      {{ t("hub.admin.title") }}
    </template>

    <n-flex
      v-if="hub.isAuthenticated"
      vertical
      align="center"
      :size="16"
      style="padding: 40px"
    >
      <n-text style="font-size: 16px">
        {{ t("hub.admin.loggedIn") }}
      </n-text>
      <n-button type="error" @click="onLogout">
        {{ t("hub.admin.logout") }}
      </n-button>
    </n-flex>

    <n-flex
      v-else
      vertical
      align="center"
      :size="16"
      style="padding: 40px"
    >
      <n-text depth="3" style="margin-bottom: 8px">
        {{ t("hub.admin.hint") }}
      </n-text>
      <n-flex :size="12" align="center">
        <n-input
          v-model:value="password"
          type="password"
          show-password-on="click"
          :placeholder="t('hub.admin.password')"
          style="width: 280px"
          @keyup.enter="onLogin"
        />
        <n-button
          type="primary"
          :loading="loading"
          @click="onLogin"
        >
          {{ t("hub.admin.login") }}
        </n-button>
      </n-flex>
    </n-flex>
  </list-view-page>
</template>
