<script lang="ts" setup>
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NA,
  NAvatar,
  NButton,
  NConfigProvider,
  NFlex,
  NLayout,
  NLayoutSider,
  NMenu,
  NScrollbar,
  NText,
  zhCN
} from "naive-ui";
import { computed, onMounted, ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import BasicIcon from "./views/components/MgcIcon.vue";
import { t } from "./i18n";
import { getMenuOptions } from "./routers/menu";
import { useAppStore } from "./stores/app";
import { usePrefStore } from "./stores/pref";
import { message } from "./utils/ui/feedback";
import { useLauncherService } from "./services/launcher";

const app = useAppStore();
const pref = usePrefStore();
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
  if (!app.selectedInstance) {
    message.warning(t("instances.selectInstance"));
    return;
  }

  if (app.runningInstancePid) {
    const isRunning = await checkRunningInstance();
    if (isRunning) {
      message.warning(t("home.alreadyRunning"));
      return;
    }
  }

  await launchInstance(app.selectedInstance);
  message.success(t("home.launching"));
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
    style="

--main-ctn-h: calc(100vh - 52px)"
  >
    <n-layout style="height: 52px; border-bottom: 1px solid rgb(239 239 245)">
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

        <n-text>
          {{ t("header.currentSelection") }}
          <n-a
            v-if="app.selectedInstanceData"
            @click="router.push('/instances')"
          >
            {{ app.selectedInstanceData.path ?? t("common.none") }}
          </n-a>
        </n-text>

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
