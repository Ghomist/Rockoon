<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import {
  NButton,
  NCard,
  NEmpty,
  NFlex,
  NIcon,
  NList,
  NListItem,
  NSpin,
  NSwitch,
  NTag,
  NText
} from "naive-ui";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import BasicIcon from "./components/MgcIcon.vue";

const { type: rscType } = defineProps<{
  type: ResourceType;
}>();

defineEmits<{
  (event: "open", file: ManagedFile): void;
}>();

const app = useAppStore();
const { t } = useI18n();

type ResourceType = "map" | "mod";
type ResourceSchema = {
  filter: string[];
  targetPath: string[];
  listFiles?: (self: ResourceSchema) => Promise<ManagedFile[]>;
};
const resourcePageSchema: Record<ResourceType, ResourceSchema> = {
  map: {
    filter: ["cmo", "nmo"],
    targetPath: ["ModLoader", "Maps"]
  },
  mod: {
    filter: ["bmod", "bmodp", "zip"],
    targetPath: ["ModLoader", "Mods"]
  }
};

const loading = ref(true);
const rscSchema = computed(() => resourcePageSchema[rscType]);
const rscName = computed(() => t("resources.name." + rscType));
const rscIcon = computed(() =>
  rscType === "map" ? "map-line" : "auction-line"
);
const rscPath = computedAsync(
  async () =>
    await join(
      app.selectedInstanceData!.path,
      ...resourcePageSchema[rscType].targetPath
    ),
  "",
  { evaluating: loading }
);
const rscList = reactive<ManagedFile[]>([]);

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

const onRefresh = async (showMessage = false) => {
  await until(loading).toBe(false);
  const list = rscSchema.value.listFiles
    ? await rscSchema.value.listFiles(rscSchema.value)
    : await backend.list(rscPath.value, rscSchema.value.filter);
  rscList.length = 0;
  rscList.push(...list);
  if (showMessage) message.success(t("resources.refresh.success"));
};

const onImport = async () => {
  const files = await browseFile({
    title: t("resources.import.tip") + " " + rscName.value,
    multiple: true,
    filters: [
      {
        name: rscName.value,
        extensions: resourcePageSchema[rscType].filter
      }
    ]
  });
  if (files && files.length) {
    for (const source of files) {
      const target = await join(
        rscPath.value,
        source.split(sep()).pop()! // pop filename
      );
      await backend.copy(source, target);
      await onRefresh();
      message.success(t("resources.import.success"));
    }
  }
};

const onDelete = async (file: ManagedFile) => {
  dialog.warning({
    title: t("common.message.warning"),
    content: t("resources.delete.message", { name: getDisplayName(file.name) }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      await backend.delete(await join(rscPath.value, file.name));
      await onRefresh();
      message.success(t("resources.delete.success"));
    }
  });
};

const onToggleDisable = async (file: ManagedFile, newValue?: boolean) => {
  // 如果传入了 newValue，根据新值判断操作
  // 如果没有传入 newValue，根据当前文件状态判断（保持向后兼容）
  const shouldEnable =
    newValue !== undefined ? newValue : isFileDisabled(file.name);

  try {
    if (shouldEnable) {
      // 启用文件：调用 enable 命令，传入带 .disable 的文件名
      await backend.enable(rscPath.value, file.name);
      message.success(t("resources.enable.success"));
    } else {
      // 禁用文件：调用 disable 命令，传入原始文件名
      await backend.disable(rscPath.value, file.name);
      message.success(t("resources.disable.success"));
    }
    await onRefresh();
  } catch (error) {
    message.error(t("resources.toggle.error"));
  }
};

const onOpenFolder = async () => {
  await backend.openInExplorer(rscPath.value);
};

onMounted(async () => {
  await onRefresh();
});
</script>

<template>
  <n-flex vertical style="height: 100%; gap: 0">
    <!-- 头部操作栏 -->
    <n-card size="small">
      <n-flex justify="space-between" align="center">
        <n-flex align="center" :size="8">
          <n-text>
            {{
              t(
                "resources.statistics." + rscType,
                { cnt: rscList.length },
                rscList.length
              )
            }}
          </n-text>
        </n-flex>
        <n-flex :size="8">
          <n-button secondary @click="onRefresh(true)">
            <template #icon>
              <BasicIcon icon="refresh-1-line" />
            </template>
            {{ t("common.action.refresh") }}
          </n-button>
          <n-button secondary @click="onImport">
            <template #icon>
              <BasicIcon icon="upload-line" />
            </template>
            {{ t("resources.import.button") }}
          </n-button>
          <n-button secondary @click="onOpenFolder">
            <template #icon>
              <BasicIcon icon="folder-line" />
            </template>
            {{ t("common.action.openFolder") }}
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <!-- 资源列表 -->
    <div
      v-if="loading"
      style="
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      "
    >
      <n-spin size="large" />
    </div>
    <n-empty
      v-else-if="rscList.length === 0"
      :description="t('resources.empty.' + rscType)"
    />
    <div v-else style="flex: 1; overflow-y: auto; padding: 4px">
      <n-list hoverable clickable>
        <n-list-item
          v-for="file in rscList"
          :key="file.name"
          @click="onToggleDisable(file, isFileDisabled(file.name))"
        >
          <n-flex align="center" :size="12">
            <n-switch
              :value="!isFileDisabled(file.name)"
              @update:value="onToggleDisable(file, $event)"
              @click.stop
            />
            <n-flex vertical :size="4" style="flex: 1; min-width: 0">
              <n-text
                :style="{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: isFileDisabled(file.name)
                    ? 'line-through'
                    : 'none'
                }"
              >
                {{ getDisplayName(file.name) }}
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                <n-tag size="tiny" :bordered="false" type="info">
                  {{ getFileExtension(file.name) }}
                </n-tag>
                <span style="margin-left: 8px">{{
                  formatFileSize(file.size)
                }}</span>
              </n-text>
            </n-flex>
          </n-flex>

          <!-- 删除按钮 -->
          <template #suffix>
            <n-button
              secondary
              type="error"
              style="padding: 0 10px"
              @click.stop="onDelete(file)"
            >
              <template #icon>
                <BasicIcon icon="delete-2-line" />
              </template>
              {{ t("resources.delete.button") }}
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </div>
  </n-flex>
</template>
