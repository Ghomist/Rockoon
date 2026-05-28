<script setup lang="ts">
import backend from "@/backend";
import { usePrefStore } from "@/stores/pref";
import { NFlex, NH2 } from "naive-ui";
import { toRefs, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate } from "@/services/updater";
import NFormWrapper from "./components/NFormWrapper.vue";
import { dialog, message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
import storage from "@/utils/storage";

const pref = toRefs(usePrefStore());
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
</script>

<template>
  <n-flex vertical style="padding: 28px">
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
    <n-h2 prefix="primary">{{ $t("settings.hub") }}</n-h2>
    <NFormWrapper
      :schema="[
        {
          type: 'select',
          label: $t('settings.hubApiUrl'),
          valueRef: pref.hubApiUrl,
          options: [
            {
              value: 'http://114.132.240.62:8000',
              label: $t('settings.hubApiDefault')
            },
            {
              value: 'http://127.0.0.1:8000',
              label: $t('settings.hubApiLocal')
            }
          ]
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
