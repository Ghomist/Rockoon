<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
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
  await profiles.load();
  message.success(t("settings.instance.changed"));
};
</script>

<template>
  <div class="flex flex-col gap-6 p-7">
    <section class="flex flex-col gap-2.5">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <span class="size-1.5 rounded-full bg-primary" />
        {{ $t("settings.instance.title") }}
      </h2>
      <p class="text-sm text-muted-foreground break-all">
        {{ prefStore.instancePath || $t("common.none") }}
      </p>
      <NFormWrapper
        :schema="[
          {
            type: 'button',
            label: $t('settings.instance.change'),
            onClick: onChangeInstancePath
          }
        ]"
      />
    </section>

    <section class="flex flex-col gap-2.5">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <span class="size-1.5 rounded-full bg-primary" />
        {{ $t("settings.basic") }}
      </h2>
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
    </section>

    <section class="flex flex-col gap-2.5">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <span class="size-1.5 rounded-full bg-primary" />
        {{ $t("settings.ingame") }}
      </h2>
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
    </section>

    <section class="flex flex-col gap-2.5">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <span class="size-1.5 rounded-full bg-primary" />
        {{ $t("settings.debug") }}
      </h2>
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
    </section>
  </div>
</template>
