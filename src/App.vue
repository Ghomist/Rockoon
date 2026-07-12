<script lang="ts" setup>
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NAvatar,
  NButton,
  NConfigProvider,
  NDropdown,
  NFlex,
  NInput,
  NLayout,
  NLayoutSider,
  NMenu,
  NScrollbar,
  NText,
  zhCN
} from "naive-ui";
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import BasicIcon from "./views/components/MgcIcon.vue";
import { t } from "./i18n";
import { getMenuOptions } from "./routers/menu";
import { useAppStore } from "./stores/app";
import { usePrefStore } from "./stores/pref";
import { useProfilesStore } from "./stores/profiles";
import { dialog, message } from "./utils/ui/feedback";
import { useLauncherService } from "./services/launcher";
import Onboarding from "./views/Onboarding.vue";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const router = useRouter();
const { checkRunningInstance, killInstance, launchInstance } =
  useLauncherService();

const theme = computed(() => (pref.darkMode ? darkTheme : lightTheme));
const locale = computed(() => (pref.language === "zh" ? zhCN : enUS));
const dateLocale = computed(() =>
  pref.language === "zh" ? dateZhCN : dateEnUS
);

// menu related props
const menuRef = ref<InstanceType<typeof NMenu>>();
const collapsed = ref(false);
const selectedKey = ref("");
const checkInterval = ref<ReturnType<typeof setInterval>>();

const onLaunchGame = async () => {
  if (!app.selectedInstanceData) return;

  if (app.runningInstancePid) {
    const isRunning = await checkRunningInstance();
    if (isRunning) {
      message.warning(t("home.alreadyRunning"));
      return;
    }
  }

  await launchInstance();
  message.success(t("home.launching"));
};

// profile dropdown
const profileOptions = computed(() => [
  ...profiles.profiles.map(p => ({
    label: p.name,
    key: `switch:${p.id}`,
    icon:
      p.id === profiles.currentProfile?.id
        ? () => h(BasicIcon, { icon: "check-line" })
        : undefined
  })),
  { type: "divider", key: "d" },
  {
    label: t("profile.create"),
    key: "create",
    icon: () => h(BasicIcon, { icon: "add-line" })
  },
  {
    label: t("profile.rename"),
    key: "rename",
    icon: () => h(BasicIcon, { icon: "edit-line" })
  },
  {
    label: t("profile.delete"),
    key: "delete",
    disabled: profiles.profiles.length <= 1,
    icon: () => h(BasicIcon, { icon: "delete-2-line" })
  }
]);

const promptName = (title: string, initial: string, onOk: (v: string) => void) => {
  const inputValue = ref(initial);
  dialog.create({
    title,
    content: () =>
      h(NInput, {
        value: inputValue.value,
        placeholder: t("profile.namePlaceholder"),
        onUpdateValue: (v: string) => {
          inputValue.value = v;
        }
      }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      const name = inputValue.value.trim();
      if (name) onOk(name);
    }
  });
};

const onProfileSelect = async (key: string) => {
  if (key.startsWith("switch:")) {
    const id = key.slice("switch:".length);
    if (id === profiles.currentProfile?.id) return;
    const loading = message.loading(t("profile.switching"));
    try {
      await profiles.switchProfile(id);
      message.success(t("profile.switched"));
    } catch {
      message.error(t("profile.switchFailed"));
    } finally {
      loading.destroy();
    }
  } else if (key === "create") {
    promptName(t("profile.create"), t("profile.defaultName"), async name => {
      await profiles.createProfile(name);
      message.success(t("profile.created"));
    });
  } else if (key === "rename") {
    const cur = profiles.currentProfile;
    if (!cur) return;
    promptName(t("profile.rename"), cur.name, async name => {
      await profiles.renameProfile(cur.id, name);
      message.success(t("profile.renamed"));
    });
  } else if (key === "delete") {
    const cur = profiles.currentProfile;
    if (!cur) return;
    dialog.warning({
      title: t("common.message.warning"),
      content: t("profile.deleteConfirm", { name: cur.name }),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: async () => {
        await profiles.deleteProfile(cur.id);
        message.success(t("profile.deleted"));
      }
    });
  }
};

onMounted(() => {
  // react to route change
  router.afterEach(() => {
    const currentPath = router.currentRoute.value.path;

    // update selected key
    selectedKey.value = currentPath;

    // remember latest route
    pref.route = currentPath;

    // auto-expand selected submenu
    menuRef.value?.showOption(currentPath);
  });

  // show welcome message
  if (pref.showWelcome) {
    setTimeout(() => {
      message.info(t("message.welcome"));
    }, 50);
  }

  // 定期检查游戏进程状态并保存游玩时间（每1秒检查一次）
  checkInterval.value = setInterval(() => {
    checkRunningInstance();
    // 更新当前的游玩时间（即使游戏还在运行）
    if (app.runningInstancePid) {
      app.updateInstanceRunningTime();
    }
  }, 1000);
});

onUnmounted(() => {
  // 清理定时器
  if (checkInterval.value) {
    clearInterval(checkInterval.value);
  }
});
</script>

<template>
  <n-config-provider
    :theme
    :locale
    :date-locale="dateLocale"
    style="--main-ctn-h: calc(100vh - 52px)"
  >
    <template v-if="app.selectedInstanceData">
      <n-layout
        style="height: 52px; border-bottom: 1px solid rgb(239 239 245)"
      >
        <n-flex
          align="center"
          justify="space-between"
          style="height: 100%; padding-right: 16px; padding-left: 16px"
        >
          <n-flex style="flex: 1">
            <n-avatar>
              <BasicIcon icon="avatar-line" />
            </n-avatar>
            <n-button @click="message.info(t('message.noImpl'))">
              {{ t("header.pleaseLogin") }}
            </n-button>
          </n-flex>

          <n-flex align="center" :size="6">
            <n-text depth="3">{{ t("profile.currentLabel") }}</n-text>
            <n-dropdown
              :options="profileOptions"
              trigger="click"
              placement="bottom"
              @select="onProfileSelect"
            >
              <n-button quaternary type="primary">
                {{ profiles.currentProfile?.name ?? t("common.none") }}
                <BasicIcon icon="arrow-down-s-line" style="margin-left: 4px" />
              </n-button>
            </n-dropdown>
          </n-flex>

          <n-flex justify="flex-end" style="flex: 1">
            <n-button
              v-if="!app.runningInstancePid"
              type="primary"
              @click="onLaunchGame"
            >
              <template #icon>
                <BasicIcon icon="play-line" />
              </template>
              {{ t("home.launch") }}
            </n-button>
            <n-button v-else type="error" @click="killInstance">
              <template #icon>
                <BasicIcon icon="stop-line" />
              </template>
              {{ t("home.stop") }}
            </n-button>
          </n-flex>
        </n-flex>
      </n-layout>

      <n-layout has-sider style="width: 100vw; height: var(--main-ctn-h)">
        <n-layout-sider
          bordered
          show-trigger
          collapse-mode="width"
          :width="180"
          :collapsed-width="50"
          :collapsed="collapsed"
          @collapse="collapsed = true"
          @expand="collapsed = false"
        >
          <n-scrollbar>
            <n-menu
              ref="menuRef"
              v-model:value="selectedKey"
              :options="getMenuOptions()"
              :indent="20"
            />
          </n-scrollbar>
        </n-layout-sider>

        <n-layout
          class="main-container-scrollbar-fix"
          style="height: 100%"
          :native-scrollbar="false"
        >
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" class="view" />
            </transition>
          </router-view>
        </n-layout>
      </n-layout>
    </template>
    <Onboarding v-else />
  </n-config-provider>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 150ms ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
