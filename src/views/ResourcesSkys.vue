<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { message } from "@/utils/ui/feedback";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import { Loader2 } from "@lucide/vue";
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "./components/ListViewPage.vue";
import SkyboxPreview from "./components/SkyboxPreview.vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const app = useAppStore();
const { t } = useI18n();

type SkyboxFile = { path: string; direction: string };

const LEVEL_LETTERS = [
  "L", "E", "A", "F", "C", "H", "D", "G", "K", "B", "J", "I"
] as const;

type SkyboxFiles = {
  [key in "Front" | "Back" | "Left" | "Right" | "Down"]?: string;
};
type SkyboxLevel = {
  level: number;
  letter: string;
  files: SkyboxFiles;
};
type BackendFile = { name: string; size: number };

const loading = ref(true);
const skyboxLevels = ref<SkyboxLevel[]>([]);
const showPreview = ref(false);
const selectedLevel = ref<SkyboxLevel | null>(null);

const refreshKey = ref(Date.now());

const importing = ref(false);
const importLoading = ref(false);
const showLevelPicker = ref(false);
const selectedImportFiles = ref<SkyboxFile[]>([]);
const selectedImportLevel = ref<number | null>(null);
let abortController: AbortController | null = null;
let importTempDir: string | null = null;

const skysPath = computedAsync(
  async () =>
    app.selectedInstanceData
      ? await join(app.selectedInstanceData.path, "Textures", "Sky")
      : "",
  "",
  { evaluating: loading }
);

const parseSkyboxFilename = (
  filename: string
): { level: number; direction: string } | null => {
  const match = filename.match(/^Sky_([A-Z]+)_([A-Za-z]+)\.bmp$/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const direction = match[2];
  const levelIndex = LEVEL_LETTERS.indexOf(letter as (typeof LEVEL_LETTERS)[number]);
  if (levelIndex === -1) return null;
  return { level: levelIndex + 1, direction };
};

const capitalizeFirst = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const loadSkyboxes = async () => {
  await until(loading).toBe(false);
  try {
    const files = (await backend.list(skysPath.value, [
      "bmp"
    ])) as BackendFile[];
    const levelsMap = new Map<number, SkyboxFiles>();
    for (const file of files) {
      const parsed = parseSkyboxFilename(file.name);
      if (parsed) {
        if (!levelsMap.has(parsed.level)) levelsMap.set(parsed.level, {});
        const direction = capitalizeFirst(parsed.direction);
        if (["Front", "Back", "Left", "Right", "Down"].includes(direction)) {
          const entry = levelsMap.get(parsed.level);
          if (entry) (entry as Record<string, string>)[direction] = file.name;
        }
      }
    }
    const levels: SkyboxLevel[] = [];
    for (const letter of LEVEL_LETTERS) {
      const levelNum = LEVEL_LETTERS.indexOf(letter) + 1;
      const files = levelsMap.get(levelNum);
      if (files && Object.keys(files).length > 0) {
        levels.push({ level: levelNum, letter, files });
      }
    }
    skyboxLevels.value = levels;
    refreshKey.value = Date.now();
  } catch (error) {
    console.error("Failed to load skyboxes:", error);
    skyboxLevels.value = [];
  } finally {
    loading.value = false;
  }
  message.success(t("common.action.refreshSuccess"));
};

const openPreview = (level: SkyboxLevel) => {
  selectedLevel.value = level;
  showPreview.value = true;
};

const onOpenFolder = async () => {
  if (skysPath.value) await backend.openInExplorer(skysPath.value);
};

const cleanupTempDir = async (dirPath: string) => {
  try {
    await backend.remove_dir(dirPath);
  } catch (error) {
    console.error("Cleanup error:", error);
  }
};

const onImportSkybox = async () => {
  const zipFile = await browseFile({
    title: t("skys.import.selectZip"),
    multiple: false,
    filters: [{ name: "Archive", extensions: ["zip"] }]
  });
  if (!zipFile || zipFile.length === 0) return;

  importing.value = true;
  importLoading.value = true;
  abortController = new AbortController();

  const systemTempDir = await backend.getTempDir();
  const tempDir = await join(systemTempDir, "rockoon_skybox_" + Date.now());

  try {
    await backend.mkdir(tempDir);
    await backend.unzip(zipFile as string, tempDir);
    const analysis = await backend.analyzeSkyboxFiles(tempDir);

    if (analysis.files.length === 0) {
      message.error(t("skys.import.detectionError"));
      await cleanupTempDir(tempDir);
      return;
    }

    const requiredDirections = ["Front", "Back", "Left", "Right", "Down"];
    const missingDirections = requiredDirections.filter(
      dir => !analysis.directions.includes(dir)
    );

    if (missingDirections.length > 0) {
      message.warning(
        t("skys.import.incomplete", { missing: missingDirections.join(", ") })
      );
    }

    selectedImportFiles.value = analysis.files;
    importTempDir = tempDir;
    message.success(
      t("skys.import.detectionSuccess", {
        cnt: analysis.files.length,
        dirs: analysis.directions.join(", ")
      })
    );
    selectedImportLevel.value = null;
    showLevelPicker.value = true;
    importLoading.value = false;
  } catch (error) {
    console.error("Import error:", error);
    message.error(t("skys.import.detectionError"));
    importLoading.value = false;
    await cleanupTempDir(tempDir);
  }
};

const onCancelImport = async () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
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
    for (const file of selectedImportFiles.value) {
      const targetFile = await join(
        targetDir,
        `Sky_${levelLetter}_${file.direction}.bmp`
      );
      await backend.copy(file.path, targetFile);
    }
    message.success(t("skys.import.replaceSuccess", { level: levelNum }));
    await loadSkyboxes();
    refreshKey.value = Date.now();
    showLevelPicker.value = false;
    importing.value = false;
    selectedImportFiles.value = [];
    selectedImportLevel.value = null;
  } catch (error) {
    console.error("Replace error:", error);
    message.error(t("skys.import.replaceError"));
  } finally {
    if (importTempDir) {
      await cleanupTempDir(importTempDir);
      importTempDir = null;
    }
  }
};

const getImageUrl = (filename: string) => {
  if (!filename || !skysPath.value) return "";
  const fullPath = `${skysPath.value}/${filename}`;
  return convertFileSrc(fullPath) + `?t=${refreshKey.value}`;
};

const getThumbnailUrl = (level: SkyboxLevel) => {
  if (level.files.Down && skysPath.value) {
    const fullPath = `${skysPath.value}/${level.files.Down}`;
    return convertFileSrc(fullPath) + `?t=${refreshKey.value}`;
  }
  return "";
};

onMounted(async () => {
  await loadSkyboxes();
});

onUnmounted(async () => {
  if (importTempDir) {
    await cleanupTempDir(importTempDir);
    importTempDir = null;
  }
});
</script>

<template>
  <ListViewPage>
    <template #title>
      {{
        t("skys.statistics", { cnt: skyboxLevels.length }, skyboxLevels.length)
      }}
    </template>

    <template #actions>
      <Button variant="outline" size="sm" @click="loadSkyboxes">
        {{ t("common.action.refresh") }}
      </Button>
      <Button variant="outline" size="sm" @click="onOpenFolder">
        {{ t("common.action.openFolder") }}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        :disabled="importLoading"
        @click="importing ? onCancelImport() : onImportSkybox()"
      >
        <Loader2 v-if="importLoading" class="size-4 animate-spin" />
        {{ importing ? t("skys.import.cancel") : t("skys.import.button") }}
      </Button>
    </template>

    <div class="relative">
      <div
        v-if="loading"
        class="flex items-center justify-center py-16"
      >
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <div
        v-else-if="skyboxLevels.length === 0"
        class="py-16 text-center text-sm text-muted-foreground"
      >
        {{ t("skys.empty") }}
      </div>

      <div
        v-else
        class="flex flex-wrap justify-around gap-4 p-4"
      >
        <Card
          v-for="level in skyboxLevels"
          :key="level.level"
          class="w-[200px] cursor-pointer transition-transform hover:-translate-y-0.5"
          @click="openPreview(level)"
        >
          <CardContent class="flex flex-col items-center gap-2 py-3">
            <div
              v-if="getThumbnailUrl(level)"
              class="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-muted"
            >
              <img
                :src="getThumbnailUrl(level)"
                :alt="'Level ' + level.level"
                class="h-full w-full object-contain"
              />
            </div>
            <p class="text-center text-sm">
              {{ t("skys.levelName", { level: level.level }) }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Skybox preview -->
    <Dialog v-model:open="showPreview">
      <DialogContent class="max-w-[60vw]">
        <DialogHeader>
          <DialogTitle>
            {{ t("skys.previewTitle", { level: selectedLevel?.level || 0 }) }}
          </DialogTitle>
        </DialogHeader>
        <SkyboxPreview
          v-if="selectedLevel"
          :level="selectedLevel"
          :skys-path="skysPath"
          :get-image-url="getImageUrl"
        />
      </DialogContent>
    </Dialog>

    <!-- Level picker -->
    <Dialog v-model:open="showLevelPicker">
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ t("skys.import.selectLevel") }}</DialogTitle>
        </DialogHeader>

        <div v-if="importLoading" class="flex items-center justify-center py-12">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else class="flex flex-col gap-4">
          <p class="text-sm text-muted-foreground">
            {{ t("skys.import.selectLevel") }}
          </p>

          <RadioGroup
            v-model="selectedImportLevel"
            class="flex flex-col gap-2"
          >
            <div
              v-for="i in 12"
              :key="i"
              class="flex items-center gap-2"
            >
              <RadioGroupItem :id="`lvl-${i}`" :value="i" />
              <Label :for="`lvl-${i}`" class="text-sm">
                {{ t("skys.levelName", { level: i }) }}
              </Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" @click="onCancelImport">
              {{ t("common.dialog.cancel") }}
            </Button>
            <Button @click="onSelectLevel">
              {{ t("common.dialog.confirm") }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </ListViewPage>
</template>
