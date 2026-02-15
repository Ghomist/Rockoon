<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import {
  NButton,
  NCard,
  NEmpty,
  NFlex,
  NModal,
  NSpin,
  NText,
  NRadioGroup,
  NRadio
} from "naive-ui";
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { message } from "@/utils/ui/feedback";
import ListViewPage from "./components/ListViewPage.vue";
import SkyboxPreview from "./components/SkyboxPreview.vue";

const app = useAppStore();
const { t } = useI18n();

// 导入天空盒分析结果类型
type SkyboxFile = {
  path: string;
  direction: string;
};

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

// 图片刷新键（用于打破浏览器缓存）
const refreshKey = ref(Date.now());

// 导入相关状态
const importing = ref(false);
const importLoading = ref(false);
const showLevelPicker = ref(false);
const selectedImportFiles = ref<SkyboxFile[]>([]);
const selectedImportLevel = ref<number | null>(null);
let abortController: AbortController | null = null;
let importTempDir: string | null = null;

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
          const files = levelsMap.get(parsed.level);
          if (files) {
            (files as Record<string, string>)[direction] = file.name;
          }
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

    // 更新刷新键以打破图片缓存
    refreshKey.value = Date.now();
  } catch (error) {
    console.error("Failed to load skyboxes:", error);
    skyboxLevels.value = [];
  } finally {
    loading.value = false;
  }

  // 刷新成功提示
  message.success(t("common.action.refreshSuccess"));
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

// 打开天空盒文件夹
const onOpenFolder = async () => {
  if (skysPath.value) {
    await backend.openInExplorer(skysPath.value);
  }
};

// 导入天空盒
const onImportSkybox = async () => {
  const zipFile = await browseFile({
    title: t("skys.import.selectZip"),
    multiple: false,
    filters: [
      {
        name: "Archive",
        extensions: ["zip"]
      }
    ]
  });

  if (!zipFile || zipFile.length === 0) {
    return;
  }

  // 开始导入流程
  importing.value = true;
  importLoading.value = true;
  abortController = new AbortController();

  // 使用系统临时目录创建临时文件夹
  const systemTempDir = await backend.getTempDir();
  const tempDir = await join(systemTempDir, "rockoon_skybox_" + Date.now());

  try {
    await backend.mkdir(tempDir);

    // 解压文件
    await backend.unzip(zipFile as string, tempDir);

    // 分析天空盒文件
    const analysis = await backend.analyzeSkyboxFiles(tempDir);

    if (analysis.files.length === 0) {
      message.error(t("skys.import.detectionError"));
      await cleanupTempDir(tempDir);
      return;
    }

    // 检查是否完整（需要5个方向）
    const requiredDirections = ["Front", "Back", "Left", "Right", "Down"];
    const missingDirections = requiredDirections.filter(
      dir => !analysis.directions.includes(dir)
    );

    if (missingDirections.length > 0) {
      message.warning(
        t("skys.import.incomplete", { missing: missingDirections.join(", ") })
      );
    }

    // 保存找到的文件
    selectedImportFiles.value = analysis.files;

    // 保存临时目录引用，用于后续清理
    importTempDir = tempDir;

    // 显示检测结果
    message.success(
      t("skys.import.detectionSuccess", {
        cnt: analysis.files.length,
        dirs: analysis.directions.join(", ")
      })
    );

    // 显示关卡选择器
    selectedImportLevel.value = null;
    showLevelPicker.value = true;
    importLoading.value = false;
  } catch (error) {
    console.error("Import error:", error);
    message.error(t("skys.import.detectionError"));
    importLoading.value = false;
    // 导入失败时清理临时目录
    await cleanupTempDir(tempDir);
  }
};

// 取消导入
const onCancelImport = async () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  // 清理解压时创建的临时目录
  if (importTempDir) {
    await cleanupTempDir(importTempDir);
    importTempDir = null;
  }

  importing.value = false;
  importLoading.value = false;
  showLevelPicker.value = false;
  selectedImportFiles.value = [];
  selectedImportLevel.value = null;
};

// 选择关卡并替换天空盒
const onSelectLevel = async () => {
  if (selectedImportLevel.value === null) {
    message.warning(t("skys.import.selectLevel"));
    return;
  }

  if (!importTempDir) {
    message.error("Import temp directory not found");
    return;
  }

  const levelNum = selectedImportLevel.value;
  const levelLetter = LEVEL_LETTERS[levelNum - 1];
  const targetDir = await join(
    app.selectedInstanceData!.path,
    "Textures",
    "Sky"
  );

  try {
    // 直接从临时目录复制文件到目标目录，同时重命名
    for (const file of selectedImportFiles.value) {
      const targetFile = await join(
        targetDir,
        `Sky_${levelLetter}_${file.direction}.bmp`
      );
      await backend.copy(file.path, targetFile);
    }

    message.success(t("skys.import.replaceSuccess", { level: levelNum }));

    // 刷新天空盒列表
    await loadSkyboxes();

    // 更新刷新键以打破图片缓存
    refreshKey.value = Date.now();

    // 关闭选择器并重置状态
    showLevelPicker.value = false;
    importing.value = false;
    selectedImportFiles.value = [];
    selectedImportLevel.value = null;
  } catch (error) {
    console.error("Replace error:", error);
    message.error(t("skys.import.replaceError"));
  } finally {
    // 无论成功失败都清理解压时创建的临时目录
    if (importTempDir) {
      await cleanupTempDir(importTempDir);
      importTempDir = null;
    }
  }
};

// 清理临时目录
const cleanupTempDir = async (dirPath: string) => {
  try {
    await backend.remove_dir(dirPath);
  } catch (error) {
    console.error("Cleanup error:", error);
  }
};

// 获取图片URL
const getImageUrl = (filename: string) => {
  if (!filename || !skysPath.value) return "";
  const fullPath = `${skysPath.value}/${filename}`;
  // 添加时间戳参数以打破浏览器缓存
  return convertFileSrc(fullPath) + `?t=${refreshKey.value}`;
};

// 获取缩略图（使用Down方向）
const getThumbnailUrl = (level: SkyboxLevel) => {
  if (level.files.Down && skysPath.value) {
    const fullPath = `${skysPath.value}/${level.files.Down}`;
    // 添加时间戳参数以打破浏览器缓存
    return convertFileSrc(fullPath) + `?t=${refreshKey.value}`;
  }
  return "";
};

onMounted(async () => {
  await loadSkyboxes();
});

// 组件卸载时清理临时文件
onUnmounted(async () => {
  if (importTempDir) {
    await cleanupTempDir(importTempDir);
    importTempDir = null;
  }
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
      <n-button @click="onOpenFolder">
        {{ t("common.action.openFolder") }}
      </n-button>
      <n-button
        type="primary"
        :loading="importLoading"
        @click="importing ? onCancelImport() : onImportSkybox()"
      >
        {{ importing ? t("skys.import.cancel") : t("skys.import.button") }}
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
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                aspect-ratio: 1;
                overflow: hidden;
                background: #f5f5f5;
                border-radius: 4px;
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

    <!-- 关卡选择弹窗 -->
    <n-modal
      v-model:show="showLevelPicker"
      preset="card"
      style="width: 400px"
      :title="t('skys.import.selectLevel')"
      :mask-closable="false"
    >
      <n-spin :show="importLoading">
        <n-flex vertical :size="16">
          <n-text depth="2">
            {{ t("skys.import.selectLevel") }}
          </n-text>

          <n-radio-group v-model:value="selectedImportLevel">
            <n-flex vertical :size="8">
              <n-radio v-for="i in 12" :key="i" :value="i">
                {{ t("skys.levelName", { level: i }) }}
              </n-radio>
            </n-flex>
          </n-radio-group>

          <n-flex justify="end" :size="12" style="margin-top: 16px">
            <n-button @click="onCancelImport">
              {{ t("common.dialog.cancel") }}
            </n-button>
            <n-button type="primary" @click="onSelectLevel">
              {{ t("common.dialog.confirm") }}
            </n-button>
          </n-flex>
        </n-flex>
      </n-spin>
    </n-modal>
  </list-view-page>
</template>
