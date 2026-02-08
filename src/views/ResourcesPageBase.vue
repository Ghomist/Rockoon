<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import { NButton, NFlex, NList, NListItem, NScrollbar } from "naive-ui";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

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
    content: t("resources.delete.message", { name: file.name }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      await backend.delete(await join(rscPath.value, file.name));
      await onRefresh();
      message.success(t("resources.delete.success"));
    }
  });
};

const onOpenFolder = async () => {
  await backend.openInExplorer(rscPath.value);
};

onMounted(async () => {
  await onRefresh();
});
</script>

<template>
  <n-list class="list-header-fix" hoverable clickable style="width: 100%">
    <template #header>
      <n-flex justify="space-between" align="center">
        <p>
          {{
            t(
              "resources.statistics." + rscType,
              { cnt: rscList.length },
              rscList.length
            )
          }}
        </p>
        <n-flex>
          <n-button @click="onRefresh(true)">
            {{ t("common.action.refresh") }}
          </n-button>
          <n-button @click="onImport">
            {{ t("resources.import.button") }}
          </n-button>
          <n-button @click="onOpenFolder">
            {{ t("common.action.openFolder") }}
          </n-button>
        </n-flex>
      </n-flex>
    </template>
    <n-scrollbar class="list-container-fix">
      <n-list-item v-for="file in rscList" :key="file.name">
        <!-- <template #prefix>
          <n-checkbox :checked="app.selectedInstanceData?.path === file.path" />
        </template> -->
        {{ file.name }} [{{ formatFileSize(file.size) }}]
        <template #suffix>
          <n-flex :wrap="false">
            <!-- <n-button secondary type="primary" @click="onOpenFolder(i)">
              {{ t("common.action.openFolder") }}
            </n-button> -->
            <n-button secondary type="error" @click="onDelete(file)">
              {{ t("resources.delete.button") }}
            </n-button>
          </n-flex>
        </template>
      </n-list-item>
    </n-scrollbar>
  </n-list>
</template>
