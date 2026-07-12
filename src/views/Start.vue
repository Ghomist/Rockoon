<script setup lang="ts">
import {
  NButton,
  NCard,
  NFlex,
  NIcon,
  NStatistic,
  NText,
  useThemeVars
} from "naive-ui";
import { computed } from "vue";
import { computedAsync } from "@vueuse/core";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { useLauncherService } from "@/services/launcher";
import { formatPlaytime } from "@/utils/format";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";
import BasicIcon from "@/views/components/MgcIcon.vue";
import { getExternalLinks } from "@/routers/menu";
import { message } from "@/utils/ui/feedback";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const { t } = useI18n();
const router = useRouter();
const themeVars = useThemeVars();
const { checkRunningInstance, killInstance, launchInstance } =
  useLauncherService();

// 统计数据
const profileCount = computed(() => profiles.profiles.length);
const totalPlaytime = computed(() => pref.playtime);

const mapCount = computedAsync(async () => {
  if (!app.selectedInstanceData) return 0;
  try {
    const mapPath = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Maps"
    );
    const maps = await backend.list(mapPath, ["cmo", "nmo"]);
    return maps.length;
  } catch {
    return 0;
  }
}, 0);

const modCount = computedAsync(async () => {
  if (!app.selectedInstanceData) return 0;
  try {
    const modPath = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Mods"
    );
    const mods = await backend.list(modPath, ["bmod", "bmodp", "zip"]);
    return mods.length;
  } catch {
    return 0;
  }
}, 0);

const stats = computed(() => [
  {
    label: "home.profileCount",
    value: profileCount.value,
    icon: "stack-line"
  },
  {
    label: "home.totalPlaytime",
    value: formatPlaytime(totalPlaytime.value),
    icon: "time-line"
  },
  { label: "home.mapCount", value: mapCount.value, icon: "map-line" },
  { label: "home.modCount", value: modCount.value, icon: "auction-line" }
]);

// 启动游戏
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

// 快捷跳转
const quickLinks = [
  {
    label: "menu.options",
    icon: "settings-1-line",
    route: "/options"
  },
  {
    label: "menu.maps",
    icon: "map-line",
    route: "/resources/maps"
  },
  {
    label: "menu.mods",
    icon: "auction-line",
    route: "/resources/mods"
  },
  {
    label: "menu.settings",
    icon: "settings-2-line",
    route: "/settings"
  }
];

// 社区链接（由 menu.ts 集中维护，语言切换时响应式刷新）
const communityLinks = computed(() => getExternalLinks());
</script>

<template>
  <div class="home">
    <!-- 启动 Hero -->
    <n-card class="hero" :bordered="false">
      <n-flex vertical align="center" :size="14">
        <n-button
          v-if="!app.runningInstancePid"
          type="primary"
          size="large"
          round
          class="launch-btn"
          @click="onLaunchGame"
        >
          <template #icon>
            <BasicIcon icon="play-line" />
          </template>
          {{ t("home.launch") }}
        </n-button>
        <n-button
          v-else
          type="error"
          size="large"
          round
          class="launch-btn"
          @click="killInstance"
        >
          <template #icon>
            <BasicIcon icon="stop-line" />
          </template>
          {{ t("home.stop") }}
        </n-button>
        <n-text v-if="app.selectedInstanceData" depth="3" class="hero-path">
          {{ app.selectedInstanceData.path }}
        </n-text>
        <n-text v-else type="warning">
          {{ t("gameConfig.selectInstance") }}
        </n-text>
      </n-flex>
    </n-card>

    <!-- 统计 -->
    <n-flex justify="space-around" align="center" class="stats-row">
      <n-statistic
        v-for="stat in stats"
        :key="stat.label"
        :label="t(stat.label)"
        :value="stat.value"
      >
        <template #prefix>
          <n-icon :color="themeVars?.primaryColor">
            <BasicIcon :icon="stat.icon" />
          </n-icon>
        </template>
      </n-statistic>
    </n-flex>

    <!-- 快捷跳转 -->
    <section>
      <n-text depth="3" class="section-title">{{ t("home.quickLinks") }}</n-text>
      <n-flex :wrap="true" :size="16" class="tiles">
        <n-card
          v-for="link in quickLinks"
          :key="link.route"
          hoverable
          class="tile"
          @click="router.push(link.route)"
        >
          <n-flex vertical align="center" :size="6">
            <n-icon :color="themeVars?.primaryColor" size="20">
              <BasicIcon :icon="link.icon" />
            </n-icon>
            <n-text>{{ t(link.label) }}</n-text>
          </n-flex>
        </n-card>
      </n-flex>
    </section>

    <!-- 平衡社区 -->
    <section>
      <n-text depth="3" class="section-title">{{ t("menu.community") }}</n-text>
      <n-flex :wrap="true" :size="16" class="tiles">
        <n-card
          v-for="link in communityLinks"
          :key="link.url"
          hoverable
          class="tile"
          @click="open(link.url)"
        >
          <n-flex vertical align="center" :size="6">
            <n-icon :color="themeVars?.primaryColor" size="20">
              <BasicIcon :icon="link.icon" />
            </n-icon>
            <n-text>{{ link.label }}</n-text>
            <n-text depth="3" class="tile-ext">
              <BasicIcon icon="external-link-line" />
            </n-text>
          </n-flex>
        </n-card>
      </n-flex>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
}

.hero {
  padding: 14px 0;
}

.stats-row {
  padding-right: 12px;
}

.launch-btn {
  height: auto;
  padding: 20px 64px;
  font-size: 20px;
}

.hero-path {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-title {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
}

.tiles {
  margin-top: 0;
}

.tile {
  flex: 1 1 130px;
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}

.tile :deep(.n-card__content) {
  padding: 12px;
}

.tile:hover {
  transform: translateY(-2px);
}

.tile-ext {
  font-size: 10px;
  opacity: 0.5;
}
</style>
