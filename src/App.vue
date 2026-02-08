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
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import BasicIcon from "./views/components/MgcIcon.vue";
import { t } from "./i18n";
import { getMenuOptions } from "./routers/menu";
import { useAppStore } from "./stores/app";
import { usePrefStore } from "./stores/pref";
import { message } from "./utils/ui/feedback";

const app = useAppStore();
const pref = usePrefStore();
const router = useRouter();

const theme = computed(() => (pref.darkMode ? darkTheme : lightTheme));
const locale = computed(() => (pref.language === "zh" ? zhCN : enUS));
const dateLocale = computed(() =>
  pref.language === "zh" ? dateZhCN : dateEnUS
);

// menu related props
const menuRef = ref<InstanceType<typeof NMenu>>();
const collapsed = ref(false);
const selectedKey = ref("");

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
});
</script>

<template>
  <n-config-provider
    :theme
    :locale
    :date-locale="dateLocale"
    style="--main-ctn-h: calc(100vh - 52px)"
  >
    <n-layout style="height: 52px; border-bottom: 1px solid rgb(239, 239, 245)">
      <n-flex
        align="center"
        justify="space-between"
        style="height: 100%; padding-left: 16px; padding-right: 16px"
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
          <n-button type="primary">
            <template #icon>
              <BasicIcon icon="play-line" />
            </template>
            {{ t("home.launch") }}
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
