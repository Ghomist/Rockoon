<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useBrpService } from "@/services/brp";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { computedAsync, until } from "@vueuse/core";
import { Trash2 } from "@lucide/vue";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "./components/ListViewPage.vue";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

type ResourceType = "map" | "mod";

const { type: rscType } = defineProps<{
  type: ResourceType;
}>();

const emit = defineEmits<{
  (event: "open", file: ManagedFile): void;
  (event: "brpImported"): void;
}>();

const app = useAppStore();
const { t } = useI18n();
const { importFromFile } = useBrpService();

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

const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");
const getDisplayName = (fileName: string) =>
  isFileDisabled(fileName) ? fileName.replace(".disable", "") : fileName;
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
        source.split(sep()).pop()!
      );
      await backend.copy(source, target);
      await onRefresh();
      message.success(t("resources.import.success"));
    }
  }
};

const onImportBrp = async () => {
  const files = await browseFile({
    title: t("brp.importButton"),
    multiple: true,
    filters: [{ name: "BRP", extensions: ["brp", "zip"] }]
  });
  if (!files || !files.length) return;
  let any = false;
  for (const f of files) {
    const result = await importFromFile(f);
    if (result) any = true;
  }
  if (any) {
    await onRefresh();
    emit("brpImported");
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
  const shouldEnable =
    newValue !== undefined ? newValue : isFileDisabled(file.name);
  try {
    if (shouldEnable) {
      await backend.enable(rscPath.value, file.name);
      message.success(t("resources.enable.success"));
    } else {
      await backend.disable(rscPath.value, file.name);
      message.success(t("resources.disable.success"));
    }
    await onRefresh();
  } catch {
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
  <ListViewPage>
    <template #title>
      {{
        t(
          "resources.statistics." + rscType,
          { cnt: rscList.length },
          rscList.length
        )
      }}
    </template>

    <template #actions>
      <Button variant="outline" size="sm" @click="onRefresh(true)">
        {{ t("common.action.refresh") }}
      </Button>
      <Button variant="outline" size="sm" @click="onImport">
        {{ t("resources.import.button") }}
      </Button>
      <Button variant="secondary" size="sm" @click="onImportBrp">
        {{ t("brp.importButton") }}
      </Button>
      <Button variant="outline" size="sm" @click="onOpenFolder">
        {{ t("common.action.openFolder") }}
      </Button>
    </template>

    <div
      v-for="file in rscList"
      :key="file.name"
      class="flex items-center gap-3 px-4 py-2.5"
      @click="onToggleDisable(file, isFileDisabled(file.name))"
    >
      <Switch
        :model-value="!isFileDisabled(file.name)"
        @update:model-value="v => onToggleDisable(file, v)"
        @click.stop
      />

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          class="truncate text-sm"
          :class="isFileDisabled(file.name) ? 'line-through opacity-60' : ''"
        >
          {{ getDisplayName(file.name) }}
        </span>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
            {{ getFileExtension(file.name) }}
          </Badge>
          <span>{{ formatFileSize(file.size) }}</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive"
        @click.stop="onDelete(file)"
      >
        <Trash2 class="size-4" />
        {{ t("resources.delete.button") }}
      </Button>
    </div>
  </ListViewPage>
</template>
