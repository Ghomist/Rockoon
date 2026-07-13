<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useLauncherService } from "@/services/launcher";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import {
  ArrowLeft,
  Folder,
  Play,
  FolderInput,
  Trash2
} from "@lucide/vue";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import DirectoryTreeDialog from "./components/DirectoryTreeDialog.vue";
import ListViewPage from "./components/ListViewPage.vue";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

const app = useAppStore();
const { launchMap } = useLauncherService();
const { t } = useI18n();

type BreadcrumbItem = {
  label: string;
  path: string;
};

const loading = ref(true);
const currentPath = ref("");
const rootPath = computedAsync(
  async () => await join(app.selectedInstanceData!.path, "ModLoader", "Maps"),
  "",
  { evaluating: loading }
);
const showCreateFolderDialog = ref(false);
const newFolderName = ref("");
const showMoveDialog = ref(false);
const itemToMove = ref<DirectoryItem | null>(null);
const directoryList = reactive<DirectoryItem[]>([]);
const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = [
    { label: t("resources.breadcrumb.root"), path: "" }
  ];
  const relativePath = currentPath.value.replace(rootPath.value, "").trim();
  if (relativePath) {
    const parts = relativePath.split(/[\\/]/).filter(Boolean);
    let accumulatedPath = "";
    for (const part of parts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      items.push({ label: part, path: accumulatedPath });
    }
  }
  return items;
});
const mapCount = computed(
  () => directoryList.filter(item => !item.isDir).length
);
const parentPath = computed(() => {
  const relativePath = currentPath.value.replace(rootPath.value, "").trim();
  if (!relativePath) return "";
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
});

const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");
const getDisplayName = (fileName: string) =>
  isFileDisabled(fileName) ? fileName.replace(".disable", "") : fileName;
const getFileExtension = (fileName: string) => {
  const name = getDisplayName(fileName);
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "";
};

const loadDirectory = async (relativePath: string = "") => {
  await until(loading).toBe(false);
  const fullPath = relativePath
    ? await join(rootPath.value, relativePath.replace(/\//g, sep()))
    : rootPath.value;
  currentPath.value = fullPath;
  directoryList.length = 0;

  const dirs = await backend.listDirs(fullPath);
  for (const dir of dirs) {
    const dirName = dir.split(/[\\/]/).pop()!;
    directoryList.push({
      name: dirName,
      isDir: true,
      path: relativePath ? `${relativePath}/${dirName}` : dirName
    });
  }

  const files = await backend.list(fullPath, ["cmo", "nmo"]);
  for (const file of files) {
    directoryList.push({
      name: file.name,
      size: file.size,
      isDir: false,
      path: ""
    });
  }

  directoryList.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return 0;
  });
};

const onBreadcrumbClick = (path: string) => loadDirectory(path);

const onRefresh = async (showMessage = false) => {
  const relativePath = currentPath.value.replace(rootPath.value, "").trim();
  await loadDirectory(relativePath);
  if (showMessage) message.success(t("resources.refresh.success"));
};

const onImport = async () => {
  const files = await browseFile({
    title: t("resources.import.tip") + " " + t("resources.name.map"),
    multiple: true,
    filters: [
      { name: t("resources.name.map"), extensions: ["cmo", "nmo"] }
    ]
  });
  if (files && files.length) {
    const targetDir = currentPath.value || rootPath.value;
    for (const source of files) {
      const target = await join(targetDir, source.split(sep()).pop()!);
      await backend.copy(source, target);
    }
    await onRefresh();
    message.success(t("resources.import.success"));
  }
};

const onDelete = async (item: DirectoryItem) => {
  dialog.warning({
    title: t("common.message.warning"),
    content: t("resources.delete.message", { name: item.name }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      const fullPath = await join(currentPath.value, item.name);
      if (item.isDir) await backend.remove_dir(fullPath);
      else await backend.delete(fullPath);
      await onRefresh();
      message.success(t("resources.delete.success"));
    }
  });
};

const onToggleDisable = async (file: DirectoryItem, newValue?: boolean) => {
  const shouldEnable =
    newValue !== undefined ? newValue : isFileDisabled(file.name);
  try {
    if (shouldEnable) {
      await backend.enable(currentPath.value, file.name);
      message.success(t("resources.enable.success"));
    } else {
      await backend.disable(currentPath.value, file.name);
      message.success(t("resources.disable.success"));
    }
    const item = directoryList.find(i => i.name === file.name);
    if (item) {
      item.name = shouldEnable
        ? file.name.replace(".disable", "")
        : `${file.name}.disable`;
    }
  } catch {
    message.error(t("resources.toggle.error"));
  }
};

const onOpenFolder = async () => {
  await backend.openInExplorer(currentPath.value || rootPath.value);
};

const onCreateFolder = () => {
  newFolderName.value = "";
  showCreateFolderDialog.value = true;
};

const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) return;
  try {
    const targetDir = currentPath.value || rootPath.value;
    const folderPath = await join(targetDir, newFolderName.value.trim());
    await backend.mkdir(folderPath);
    message.success(t("resources.createFolder.success"));
    showCreateFolderDialog.value = false;
    await onRefresh();
  } catch {
    message.error(t("resources.createFolder.error"));
  }
};

const onMoveFile = (item: DirectoryItem) => {
  itemToMove.value = item;
  showMoveDialog.value = true;
};

const handleMoveFile = async (targetPath: string) => {
  if (!itemToMove.value) return;
  try {
    const sourcePath = itemToMove.value.isDir
      ? await join(rootPath.value, itemToMove.value.path)
      : await join(currentPath.value, itemToMove.value.name);
    const targetFilePath = await join(targetPath, itemToMove.value.name);
    await backend.rename(sourcePath, targetFilePath);
    message.success(t("resources.move.success"));
    showMoveDialog.value = false;
    itemToMove.value = null;
    await onRefresh();
  } catch (error) {
    message.error(`${t("resources.move.error")}: ${error}`);
  }
};

onMounted(async () => {
  await loadDirectory();
});
</script>

<template>
  <ListViewPage>
    <template #title>
      <div class="flex items-center gap-3">
        <Breadcrumb v-if="breadcrumbItems.length > 0">
          <BreadcrumbList>
            <template v-for="(item, idx) in breadcrumbItems" :key="idx">
              <BreadcrumbItem>
                <button
                  type="button"
                  class="cursor-pointer text-sm hover:text-primary"
                  @click="onBreadcrumbClick(item.path)"
                >
                  {{ item.label }}
                </button>
              </BreadcrumbItem>
              <BreadcrumbSeparator
                v-if="idx < breadcrumbItems.length - 1"
              />
            </template>
          </BreadcrumbList>
        </Breadcrumb>
        <span class="text-sm">
          {{ t("resources.statistics.map", { cnt: mapCount }, mapCount) }}
        </span>
      </div>
    </template>

    <template #actions>
      <Button variant="outline" size="sm" @click="onRefresh(true)">
        {{ t("common.action.refresh") }}
      </Button>
      <Button variant="outline" size="sm" @click="onCreateFolder">
        {{ t("resources.createFolder.button") }}
      </Button>
      <Button variant="outline" size="sm" @click="onImport">
        {{ t("resources.import.button") }}
      </Button>
      <Button variant="outline" size="sm" @click="onOpenFolder">
        {{ t("common.action.openFolder") }}
      </Button>
    </template>

    <!-- Parent dir row -->
    <div
      v-if="currentPath && currentPath !== rootPath"
      class="flex cursor-pointer items-center gap-2 px-4 py-2.5 hover:bg-accent"
      @click="onBreadcrumbClick(parentPath)"
    >
      <ArrowLeft class="size-4" />
      <span class="text-sm">{{ t("resources.breadcrumb.backToParent") }}</span>
    </div>

    <div
      v-for="item in directoryList"
      :key="item.name"
      class="flex items-center gap-3 px-4 py-2.5"
      @click="
        item.isDir
          ? loadDirectory(item.path)
          : onToggleDisable(item, isFileDisabled(item.name))
      "
    >
      <Folder v-if="item.isDir" class="size-4 text-muted-foreground" />
      <Switch
        v-else
        :model-value="!isFileDisabled(item.name)"
        @update:model-value="v => onToggleDisable(item, v)"
        @click.stop
      />

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          class="truncate text-sm"
          :class="
            !item.isDir && isFileDisabled(item.name)
              ? 'line-through opacity-60'
              : ''
          "
        >
          {{ item.isDir ? item.name : getDisplayName(item.name) }}
        </span>
        <div
          v-if="!item.isDir"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
            {{ getFileExtension(item.name) }}
          </Badge>
          <span>{{ formatFileSize(item.size!) }}</span>
        </div>
        <div v-else>
          <Badge variant="outline" class="px-1.5 py-0 text-[10px]">
            {{ t("resources.folder.name") }}
          </Badge>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <Button
          v-if="!item.isDir && !isFileDisabled(item.name)"
          variant="ghost"
          size="sm"
          class="text-emerald-600 hover:text-emerald-700"
          @click.stop="launchMap([currentPath, item.name].join('/'))"
        >
          <Play class="size-4" />
          {{ t("resources.launch.button") }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          @click.stop="onMoveFile(item)"
        >
          <FolderInput class="size-4" />
          {{ t("resources.move.button") }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive"
          @click.stop="onDelete(item)"
        >
          <Trash2 class="size-4" />
          {{ t("resources.delete.button") }}
        </Button>
      </div>
    </div>

    <!-- Create folder dialog -->
    <Dialog v-model:open="showCreateFolderDialog">
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ t("resources.createFolder.title") }}</DialogTitle>
        </DialogHeader>
        <Input
          v-model="newFolderName"
          :placeholder="t('resources.createFolder.placeholder')"
          @keyup.enter="handleCreateFolder"
        />
        <DialogFooter>
          <Button variant="outline" @click="showCreateFolderDialog = false">
            {{ t("common.dialog.cancel") }}
          </Button>
          <Button :disabled="!newFolderName.trim()" @click="handleCreateFolder">
            {{ t("common.dialog.confirm") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Move dialog -->
    <DirectoryTreeDialog
      v-model:show="showMoveDialog"
      :root-path="rootPath"
      :current-path="currentPath"
      :item-to-move-path="itemToMove?.isDir ? itemToMove.path : undefined"
      @confirm="handleMoveFile"
    />
  </ListViewPage>
</template>
