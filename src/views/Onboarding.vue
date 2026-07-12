<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { message } from "@/utils/ui/feedback";
import { open as browseDir } from "@tauri-apps/plugin-dialog";
import { NButton, NCard, NFlex, NIcon, NText } from "naive-ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import BasicIcon from "./components/MgcIcon.vue";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const { t } = useI18n();
const router = useRouter();

const picking = ref(false);
const onPickFolder = async () => {
  picking.value = true;
  try {
    const folder = await browseDir({
      directory: true,
      title: t("onboarding.browse.title")
    });
    if (!folder) return;

    const ok = await app.loadInstance(folder);
    if (!ok) {
      message.error(t("onboarding.invalid"));
      return;
    }
    pref.instancePath = folder;
    await profiles.load(); // 创建 .rockoon + 默认 profile
    message.success(t("onboarding.success"));
    router.replace(pref.route || "/game");
  } finally {
    picking.value = false;
  }
};
</script>

<template>
  <div class="onboarding">
    <n-card class="panel" :bordered="false" size="huge">
      <n-flex vertical align="center" :size="20">
        <n-icon :size="72" :color="pref.darkMode ? '#fff' : '#18a058'">
          <BasicIcon icon="rocket-2-line" />
        </n-icon>

        <n-flex vertical align="center" :size="6">
          <h1 class="title">{{ t("onboarding.title") }}</h1>
          <n-text depth="3" class="desc">
            {{ t("onboarding.desc") }}
          </n-text>
        </n-flex>

        <n-button
          type="primary"
          size="large"
          :loading="picking"
          @click="onPickFolder"
        >
          <template #icon>
            <BasicIcon icon="folder-open-line" />
          </template>
          {{ t("onboarding.pick") }}
        </n-button>

        <n-text depth="2" class="hint">
          {{ t("onboarding.hint") }}
        </n-text>
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.onboarding {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.panel {
  max-width: 520px;
  width: 100%;
  border-radius: 16px;
}
.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}
.desc {
  font-size: 14px;
  text-align: center;
}
.hint {
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
}
</style>
