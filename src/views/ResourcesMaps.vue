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
  NBreadcrumb,
  NBreadcrumbItem,
  NButton,
  NFlex,
  NInput,
  NListItem,
  NModal,
  NSwitch,
  NTag,
  NText
} from "naive-ui";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import DirectoryTreeDialog from "./components/DirectoryTreeDialog.vue";
import ListViewPage from "./components/ListViewPage.vue";
import BasicIcon from "./components/MgcIcon.vue";

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

// 计算父目录路径（用于返回上一级）
const parentPath = computed(() => {
  const relativePath = currentPath.value.replace(rootPath.value, "").trim();
  if (!relativePath) return "";
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
});

// 检查文件是否被禁用（以 .disable 结尾）
const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");

// 获取显示的文件名（移除 .disable 后缀）
const getDisplayName = (fileName: string) => {
  if (isFileDisabled(fileName)) {
    return fileName.replace(".disable", "");
  }
  return fileName;
};

// 获取文件扩展名
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

  // 加载子目录
  const dirs = await backend.listDirs(fullPath);
  for (const dir of dirs) {
    const dirName = dir.split(/[\\/]/).pop()!;
    directoryList.push({
      name: dirName,
      isDir: true,
      path: relativePath ? `${relativePath}/${dirName}` : dirName
    });
  }

  // 加载地图文件
  const files = await backend.list(fullPath, ["cmo", "nmo"]);
  for (const file of files) {
    directoryList.push({
      name: file.name,
      size: file.size,
      isDir: false,
      path: ""
    });
  }

  // 按类型排序：文件夹在前，文件在后
  directoryList.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return 0;
  });
};

const onBreadcrumbClick = (path: string) => {
  loadDirectory(path);
};

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
      {
        name: t("resources.name.map"),
        extensions: ["cmo", "nmo"]
      }
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
      if (item.isDir) {
        await backend.remove_dir(fullPath);
      } else {
        await backend.delete(fullPath);
      }
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

    // 直接更新列表中的文件名，避免重新加载导致闪烁
    const item = directoryList.find(item => item.name === file.name);
    if (item) {
      const newFileName = shouldEnable
        ? file.name.replace(".disable", "")
        : `${file.name}.disable`;
      item.name = newFileName;
    }
  } catch (error) {
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
  if (!newFolderName.value.trim()) {
    return;
  }

  try {
    const targetDir = currentPath.value || rootPath.value;
    const folderPath = await join(targetDir, newFolderName.value.trim());
    await backend.mkdir(folderPath);
    message.success(t("resources.createFolder.success"));
    showCreateFolderDialog.value = false;
    await onRefresh();
  } catch (error) {
    message.error(t("resources.createFolder.error"));
  }
};

const onMoveFile = (item: DirectoryItem) => {
  itemToMove.value = item;
  showMoveDialog.value = true;
};

const handleMoveFile = async (targetPath: string) => {
  if (!itemToMove.value) {
    return;
  }

  try {
    // 根据是否是文件夹使用不同的路径计算方式
    const sourcePath = itemToMove.value.isDir
      ? await join(rootPath.value, itemToMove.value.path)
      : await join(currentPath.value, itemToMove.value.name);
    const targetFilePath = await join(targetPath, itemToMove.value.name);
    console.log("Moving item:", { sourcePath, targetFilePath });
    await backend.rename(sourcePath, targetFilePath);
    message.success(t("resources.move.success"));
    showMoveDialog.value = false;
    itemToMove.value = null;
    await onRefresh();
  } catch (error) {
    console.error("Move failed:", error);
    message.error(`${t("resources.move.error")}: ${error}`);
  }
};

onMounted(async () => {
  await loadDirectory();
});
</script>

<template>
  <list-view-page>
    <template #title>
      <n-flex align="center" :size="12">
        <n-breadcrumb v-if="breadcrumbItems.length > 0">
          <n-breadcrumb-item
            v-for="(item, index) in breadcrumbItems"
            :key="index"
            style="cursor: pointer"
            @click="onBreadcrumbClick(item.path)"
          >
            {{ item.label }}
          </n-breadcrumb-item>
        </n-breadcrumb>
        <span style="margin-left: 8px">
          {{ t("resources.statistics.map", { cnt: mapCount }, mapCount) }}
        </span>
      </n-flex>
    </template>

    <template #actions>
      <n-button @click="onRefresh(true)">
        {{ t("common.action.refresh") }}
      </n-button>
      <n-button @click="onCreateFolder">
        {{ t("resources.createFolder.button") }}
      </n-button>
      <n-button @click="onImport">
        {{ t("resources.import.button") }}
      </n-button>
      <n-button @click="onOpenFolder">
        {{ t("common.action.openFolder") }}
      </n-button>
    </template>

    <!-- 返回上一级虚拟目录（仅在非根目录时显示） -->
    <n-list-item
      v-if="currentPath && currentPath !== rootPath"
      :key="'..'"
      @click="onBreadcrumbClick(parentPath)"
    >
      <template #prefix>
        <BasicIcon icon="arrow-left-up-line" />
      </template>
      <n-text>{{ t("resources.breadcrumb.backToParent") }}</n-text>
    </n-list-item>

    <n-list-item
      v-for="item in directoryList"
      :key="item.name"
      @click="
        item.isDir
          ? loadDirectory(item.path)
          : onToggleDisable(item, isFileDisabled(item.name))
      "
    >
      <template #prefix>
        <BasicIcon v-if="item.isDir" icon="folder-3-line" />
        <n-switch
          v-else
          :value="!isFileDisabled(item.name)"
          @update:value="onToggleDisable(item, $event)"
          @click.stop
        />
      </template>

      <n-flex align="center" :size="12">
        <n-flex vertical :size="4" style="flex: 1; min-width: 0">
          <n-text
            :style="{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration:
                !item.isDir && isFileDisabled(item.name)
                  ? 'line-through'
                  : 'none'
            }"
          >
            {{ item.isDir ? item.name : getDisplayName(item.name) }}
          </n-text>
          <n-text v-if="!item.isDir" depth="3" style="font-size: 12px">
            <n-tag size="tiny" :bordered="false" type="info">
              {{ getFileExtension(item.name) }}
            </n-tag>
            <span style="margin-left: 8px">{{
              formatFileSize(item.size!)
            }}</span>
          </n-text>
          <n-text v-else depth="3" style="font-size: 12px">
            <n-tag size="tiny" :bordered="false" type="info">
              {{ t("resources.folder.name") }}
            </n-tag>
          </n-text>
        </n-flex>
      </n-flex>

      <template #suffix>
        <n-flex v-if="!item.isDir" :wrap="false" align="center">
          <n-button
            v-if="!isFileDisabled(item.name)"
            secondary
            type="success"
            @click.stop="
              launchMap([currentPath, item.name].join('/'))
            "
          >
            <template #icon>
              <BasicIcon icon="play-line" />
            </template>
            {{ t("resources.launch.button") }}
          </n-button>
          <n-button secondary type="primary" @click.stop="onMoveFile(item)">
            <template #icon>
              <BasicIcon icon="file-export-line" />
            </template>
            {{ t("resources.move.button") }}
          </n-button>
          <n-button secondary type="error" @click.stop="onDelete(item)">
            <template #icon>
              <BasicIcon icon="delete-2-line" />
            </template>
            {{ t("resources.delete.button") }}
          </n-button>
        </n-flex>
        <n-flex v-else :wrap="false" align="center">
          <n-button secondary type="primary" @click.stop="onMoveFile(item)">
            <template #icon>
              <BasicIcon icon="file-export-line" />
            </template>
            {{ t("resources.move.button") }}
          </n-button>
          <n-button secondary type="error" @click.stop="onDelete(item)">
            <template #icon>
              <BasicIcon icon="delete-2-line" />
            </template>
            {{ t("resources.delete.button") }}
          </n-button>
        </n-flex>
      </template>
    </n-list-item>

    <!-- 新建文件夹对话框 -->
    <n-modal
      v-model:show="showCreateFolderDialog"
      preset="card"
      :title="t('resources.createFolder.title')"
      :style="{ width: '400px' }"
    >
      <n-input
        v-model:value="newFolderName"
        :placeholder="t('resources.createFolder.placeholder')"
        @keyup.enter="handleCreateFolder"
      />
      <template #footer>
        <n-flex justify="end" :size="12">
          <n-button @click="showCreateFolderDialog = false">
            {{ t("common.dialog.cancel") }}
          </n-button>
          <n-button
            type="primary"
            :disabled="!newFolderName.trim()"
            @click="handleCreateFolder"
          >
            {{ t("common.dialog.confirm") }}
          </n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- 移动文件对话框 -->
    <directory-tree-dialog
      v-model:show="showMoveDialog"
      :root-path="rootPath"
      :current-path="currentPath"
      :item-to-move-path="itemToMove?.isDir ? itemToMove.path : undefined"
      @confirm="handleMoveFile"
    />
  </list-view-page>
</template>
