<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { NButton, NFlex, NH2, NText } from "naive-ui";
import { toRefs, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate } from "@/services/updater";
import NFormWrapper from "./components/NFormWrapper.vue";
import { dialog, message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
import storage from "@/utils/storage";
import { open as browseDir } from "@tauri-apps/plugin-dialog";

const prefStore = usePrefStore();
const pref = toRefs(prefStore);
const app = useAppStore();
const profiles = useProfilesStore();
const appVersion = ref("");
const { t } = useI18n();
getVersion().then(v => (appVersion.value = v));

const onCheckUpdate = async () => {
  const msg = message.loading(t("settings.checkingUpdate"), { duration: 0 });
  await checkForUpdate();
  msg.destroy();
};

const onReload = () => {
  location.reload();
};

const onChangeInstancePath = async () => {
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
  prefStore.instancePath = folder;
  await profiles.load(); // 读取新实例的 .rockoon（不存在则建默认 profile）
  message.success(t("settings.instance.changed"));
};
</script>

<template>
  <n-flex vertical style="padding: 28px">
    <n-h2 prefix="primary"> {{ $t("settings.instance.title") }} </n-h2>
    <n-flex vertical :size="10">
      <n-text depth="3" style="word-break: break-all">
        {{ pref.instancePath || $t("common.none") }}
      </n-text>
      <n-button @click="onChangeInstancePath">
        {{ $t("settings.instance.change") }}
      </n-button>
    </n-flex>

    <n-h2 prefix="primary"> {{ $t("settings.basic") }} </n-h2>
    <NFormWrapper
      :schema="[
        {
          type: 'select',
          label: '语言 / Language',
          valueRef: pref.language,
          options: [
            { value: 'en', label: 'English' },
            { value: 'zh', label: '简体中文' }
          ]
        },
        {
          type: 'select',
          label: $t('settings.theme.title'),
          valueRef: pref.theme,
          options: [
            { value: 'auto', label: $t('settings.theme.auto') },
            { value: 'light', label: $t('settings.theme.light') },
            { value: 'dark', label: $t('settings.theme.dark') }
          ]
        },
        {
          type: 'switch',
          label: $t('settings.centerWindow'),
          valueRef: pref.centerWindow
        },
        {
          type: 'switch',
          label: $t('settings.hideWinWhenLaunch'),
          valueRef: pref.hideWinWhenLaunch
        },
        {
          type: 'switch',
          label: $t('settings.showWelcome'),
          valueRef: pref.showWelcome
        }
      ]"
    />
    <n-h2 prefix="primary"> {{ $t("settings.ingame") }} </n-h2>
    <NFormWrapper
      :schema="[
        {
          type: 'switch',
          label: $t('settings.mapOnlyMode'),
          tip: $t('settings.mapOnlyModeTip'),
          valueRef: pref.mapOnlyMode
        },
        {
          type: 'switch',
          label: $t('settings.ingameMotd'),
          valueRef: pref.ingameMotd
        },
        {
          type: 'input',
          label: $t('settings.ingameMotdContent'),
          valueRef: pref.ingameMotdContent
        }
      ]"
    />
    <n-h2 prefix="primary">{{ $t("settings.debug") }}</n-h2>
    <NFormWrapper
      :schema="[
        {
          type: 'button',
          label: $t('settings.checkUpdate'),
          tip: $t('settings.update') + appVersion,
          onClick: onCheckUpdate
        },
        {
          type: 'button',
          label: $t('common.action.openDevtools'),
          onClick: () => backend.openDevtools()
        },
        {
          type: 'button',
          label: $t('settings.clearStorage.button'),
          onClick: () => {
            dialog.error({
              title: $t('common.message.warning'),
              content: $t('settings.clearStorage.title'),
              positiveText: $t('common.dialog.confirm'),
              negativeText: $t('common.dialog.cancel'),
              onPositiveClick: () => {
                storage.clear();
                onReload();
              }
            });
          }
        }
      ]"
    />
  </n-flex>
</template>
