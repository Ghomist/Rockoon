<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { computedAsync, until } from "@vueuse/core";
import { NButton, NCard, NEmpty, NFlex, NModal, NSpin, NText } from "naive-ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "./components/ListViewPage.vue";
import SkyboxPreview from "./components/SkyboxPreview.vue";

const app = useAppStore();
const { t } = useI18n();

// 12关标识对应字母
const LEVEL_LETTERS = [
  "L",
  "E",
  "A",
  "F",
  "C",
  "H",
  "D",
  "G",
  "K",
  "B",
  "J",
  "I"
] as const;

type SkyboxFiles = {
  [key in "Front" | "Back" | "Left" | "Right" | "Down"]?: string;
};

type SkyboxLevel = {
  level: number;
  letter: string;
  files: SkyboxFiles;
};

// 后端返回的文件类型
type BackendFile = {
  name: string;
  size: number;
};

const loading = ref(true);
const skyboxLevels = ref<SkyboxLevel[]>([]);
const showPreview = ref(false);
const selectedLevel = ref<SkyboxLevel | null>(null);

// Skybox路径
const skysPath = computedAsync(
  async () =>
    app.selectedInstanceData
      ? await join(app.selectedInstanceData.path, "Textures", "Sky")
      : "",
  "",
  { evaluating: loading }
);

// 解析文件名，格式：Sky_X_Dir.bmp
const parseSkyboxFilename = (
  filename: string
): { level: number; direction: string } | null => {
  const match = filename.match(/^Sky_([A-Z]+)_([A-Za-z]+)\.bmp$/i);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const direction = match[2];

  // 查找关卡编号
  const levelIndex = LEVEL_LETTERS.indexOf(letter as any);
  if (levelIndex === -1) return null;

  return { level: levelIndex + 1, direction };
};

// 加载天空盒列表
const loadSkyboxes = async () => {
  await until(loading).toBe(false);

  try {
    const files = (await backend.list(skysPath.value, [
      "bmp"
    ])) as BackendFile[];

    // 按关卡分组
    const levelsMap = new Map<number, SkyboxFiles>();

    for (const file of files) {
      const parsed = parseSkyboxFilename(file.name);
      if (parsed) {
        if (!levelsMap.has(parsed.level)) {
          levelsMap.set(parsed.level, {});
        }
        const direction = capitalizeFirst(parsed.direction);
        if (["Front", "Back", "Left", "Right", "Down"].includes(direction)) {
          (levelsMap.get(parsed.level) as any)[direction] = file.name;
        }
      }
    }

    // 转换为数组，按关卡排序
    const levels: SkyboxLevel[] = [];
    for (const level of LEVEL_LETTERS) {
      const levelNum = LEVEL_LETTERS.indexOf(level) + 1;
      const files = levelsMap.get(levelNum);
      if (files && Object.keys(files).length > 0) {
        levels.push({
          level: levelNum,
          letter: level,
          files
        });
      }
    }

    skyboxLevels.value = levels;
  } catch (error) {
    console.error("Failed to load skyboxes:", error);
    skyboxLevels.value = [];
  } finally {
    loading.value = false;
  }
};

// 首字母大写
const capitalizeFirst = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// 打开天空盒预览
const openPreview = (level: SkyboxLevel) => {
  selectedLevel.value = level;
  showPreview.value = true;
};

// 获取图片URL
const getImageUrl = (filename: string) => {
  if (!filename || !skysPath.value) return "";
  const fullPath = `${skysPath.value}/${filename}`;
  return convertFileSrc(fullPath);
};

// 获取缩略图（使用Down方向）
const getThumbnailUrl = (level: SkyboxLevel) => {
  if (level.files.Down && skysPath.value) {
    const fullPath = `${skysPath.value}/${level.files.Down}`;
    return convertFileSrc(fullPath);
  }
  return "";
};

onMounted(async () => {
  await loadSkyboxes();
});
</script>

<template>
  <list-view-page>
    <template #title>
      {{
        t("skys.statistics", { cnt: skyboxLevels.length }, skyboxLevels.length)
      }}
    </template>

    <template #actions>
      <n-button @click="loadSkyboxes">
        {{ t("common.action.refresh") }}
      </n-button>
    </template>

    <n-spin :show="loading">
      <n-flex
        :wrap="true"
        :size="16"
        justify="space-around"
        style="padding: 16px"
      >
        <n-card
          v-for="level in skyboxLevels"
          :key="level.level"
          hoverable
          style="width: 200px; cursor: pointer"
          @click="openPreview(level)"
        >
          <n-flex vertical align="center" :size="8">
            <div
              v-if="getThumbnailUrl(level)"
              style="
                width: 100%;
                aspect-ratio: 1;
                background: #f5f5f5;
                border-radius: 4px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
              "
            >
              <img
                :src="getThumbnailUrl(level)"
                :alt="'Level ' + level.level"
                style="width: 100%; height: 100%; object-fit: contain"
              />
            </div>
            <n-text style="text-align: center">
              {{ t("skys.levelName", { level: level.level }) }}
            </n-text>
            <n-text depth="3" style="font-size: 12px; text-align: center">
              {{ Object.keys(level.files).length + "/5" }}
            </n-text>
          </n-flex>
        </n-card>
      </n-flex>
    </n-spin>

    <n-empty
      v-if="!loading && skyboxLevels.length === 0"
      :description="t('skys.empty')"
    />

    <!-- 天空盒预览弹窗 -->
    <n-modal
      v-model:show="showPreview"
      preset="card"
      style="width: 60%"
      :title="t('skys.previewTitle', { level: selectedLevel?.level || 0 })"
    >
      <skybox-preview
        v-if="selectedLevel"
        :level="selectedLevel"
        :skys-path="skysPath"
        :get-image-url="getImageUrl"
      />
    </n-modal>
  </list-view-page>
</template>
