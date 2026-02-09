<script setup lang="ts">
import { NButton, NCard, NFlex, NIcon, NStatistic, NTag } from "naive-ui";
import { computed } from "vue";
import { computedAsync } from "@vueuse/core";
import { useAppStore } from "@/stores/app";
import { useInstancesStore } from "@/stores/instances";
import { useLauncherService } from "@/services/launcher";
import { formatPlaytime } from "@/utils/format";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import BasicIcon from "@/views/components/MgcIcon.vue";
import { message } from "@/utils/ui/feedback";

const app = useAppStore();
const instancesStore = useInstancesStore();
const { t } = useI18n();
const router = useRouter();
const { checkRunningInstance, killInstance, launchInstance } =
  useLauncherService();

// 统计数据
const instanceCount = computed(() => instancesStore.instances.length);
const totalPlaytime = computed(() =>
  instancesStore.instances.reduce((sum, inst) => sum + inst.playtime, 0)
);

// 获取地图和 mod 数量
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

// 启动游戏
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

// 快捷跳转
const quickLinks = [
  {
    label: "menu.instances",
    icon: "classify-2-line",
    route: "/instances"
  },
  {
    label: "menu.download",
    icon: "download-2-line",
    route: "/download"
  },
  {
    label: "menu.maps",
    icon: "map-line",
    route: "/maps"
  },
  {
    label: "menu.mods",
    icon: "auction-line",
    route: "/mods"
  },
  {
    label: "menu.settings",
    icon: "settings-2-line",
    route: "/settings"
  }
];
</script>

<template>
  <n-flex vertical style="height: 100%; padding: 20px; gap: 20px">
    <!-- 启动按钮区域 -->
    <n-card style="text-align: center">
      <n-flex vertical align="center">
        <n-button
          v-if="!app.runningInstancePid"
          type="primary"
          size="large"
          style="font-size: 20px; padding: 20px 60px"
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
          style="font-size: 20px; padding: 20px 60px"
          @click="killInstance"
        >
          <template #icon>
            <BasicIcon icon="stop-line" />
          </template>
          {{ t("home.stop") }}
        </n-button>
        <div v-if="app.selectedInstanceData" style="margin-top: 10px">
          <n-tag type="info" size="small">
            {{ app.selectedInstanceData.path }}
          </n-tag>
        </div>
        <div v-else style="margin-top: 10px">
          <n-tag type="warning" size="small">
            {{ t("gameConfig.selectInstance") }}
          </n-tag>
        </div>
      </n-flex>
    </n-card>

    <!-- 统计信息区域 -->
    <n-flex :wrap="false">
      <n-card style="flex: 1">
        <n-statistic :label="t('home.instanceCount')" :value="instanceCount">
          <template #prefix>
            <n-icon><BasicIcon icon="classify-2-line" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card style="flex: 1">
        <n-statistic :label="t('home.totalPlaytime')" :value="totalPlaytime">
          <template #prefix>
            <n-icon><BasicIcon icon="time-line" /></n-icon>
          </template>
          <template #suffix>
            {{ formatPlaytime(totalPlaytime) }}
          </template>
        </n-statistic>
      </n-card>
    </n-flex>

    <n-flex :wrap="false">
      <n-card style="flex: 1">
        <n-statistic :label="t('home.mapCount')" :value="mapCount">
          <template #prefix>
            <n-icon><BasicIcon icon="map-line" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
      <n-card style="flex: 1">
        <n-statistic :label="t('home.modCount')" :value="modCount">
          <template #prefix>
            <n-icon><BasicIcon icon="auction-line" /></n-icon>
          </template>
        </n-statistic>
      </n-card>
    </n-flex>

    <!-- 快捷跳转区域 -->
    <n-card :title="t('home.quickLinks')">
      <n-flex :wrap="true" style="gap: 10px">
        <n-button
          v-for="link in quickLinks"
          :key="link.route"
          style="flex: 1; min-width: 120px"
          @click="router.push(link.route)"
        >
          <template #icon>
            <BasicIcon :icon="link.icon" />
          </template>
          {{ t(link.label) }}
        </n-button>
      </n-flex>
    </n-card>
  </n-flex>
</template>
