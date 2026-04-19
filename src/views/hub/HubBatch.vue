<script setup lang="ts">
import { useHubStore } from "@/stores/hub";
import { batchUpload, downloadBatchTemplate } from "@/services/hub";
import { message } from "@/utils/ui/feedback";
import { invoke } from "@tauri-apps/api/core";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import {
  NButton,
  NDataTable,
  NFlex,
  NText
} from "naive-ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "../components/ListViewPage.vue";

const { t } = useI18n();
const hub = useHubStore();

const zipFilePath = ref("");
const uploading = ref(false);
const downloading = ref(false);

const total = ref(0);
const created = ref(0);
const failed = ref(0);
const results = ref<HubBatchRowResult[]>([]);
const done = ref(false);

const columns = [
  { title: t("hub.batch.row"), key: "row", width: 60 },
  { title: t("hub.batch.mapName"), key: "name" },
  {
    title: t("hub.batch.status"),
    key: "ok",
    width: 80,
    render: (row: HubBatchRowResult) =>
      row.ok
        ? t("hub.batch.success")
        : t("hub.batch.fail")
  },
  {
    title: t("hub.batch.detail"),
    key: "detail",
    render: (row: HubBatchRowResult) =>
      row.ok
        ? `ID: ${row.id}, ${t("hub.batch.previews")}: ${row.previews}`
        : row.error || ""
  }
];

const onDownloadTemplate = async () => {
  downloading.value = true;
  try {
    const blob = await downloadBatchTemplate();
    const arrayBuffer = await blob.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));
    const savePath = await invoke<string>("get_temp_dir").then(dir =>
      `${dir}/ballance_batch_upload_template.xlsx`
    );
    await invoke("write_file", { path: savePath, data });
    await invoke("open", { path: savePath });
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  } finally {
    downloading.value = false;
  }
};

const selectZipFile = async () => {
  const files = await browseFile({
    title: t("hub.batch.selectZip"),
    multiple: false,
    filters: [{ name: "ZIP", extensions: ["zip"] }]
  });
  if (files) zipFilePath.value = files;
};

const onSubmit = async () => {
  if (!zipFilePath.value) return;
  uploading.value = true;
  done.value = false;
  results.value = [];

  try {
    const fd = new FormData();
    fd.append("zip_file", zipFilePath.value);
    const res = await batchUpload(fd);
    total.value = res.total;
    created.value = res.created;
    failed.value = res.failed;
    results.value = res.results;
    done.value = true;
    message.success(t("hub.batch.done", { total: res.total, created: res.created, failed: res.failed }));
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  } finally {
    uploading.value = false;
  }
};
</script>

<template>
  <list-view-page>
    <template #title>
      {{ t("hub.batch.title") }}
    </template>

    <template #actions />

    <n-flex
      v-if="!hub.isAuthenticated"
      justify="center"
      style="padding: 40px"
    >
      <n-text depth="3">{{ t("hub.batch.noAuth") }}</n-text>
    </n-flex>

    <n-flex v-else vertical :size="16" style="padding: 16px">
      <!-- Step 1: Download template -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.batch.step1") }}</n-text>
        <n-text depth="3" style="font-size: 13px">
          {{ t("hub.batch.step1Desc") }}
        </n-text>
        <n-button
          size="small"
          :loading="downloading"
          @click="onDownloadTemplate"
        >
          {{ t("hub.batch.downloadTemplate") }}
        </n-button>
      </n-flex>

      <!-- Step 2: Upload zip -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.batch.step2") }}</n-text>
        <n-text depth="3" style="font-size: 13px">
          {{ t("hub.batch.step2Desc") }}
        </n-text>
        <n-flex :size="8" align="center">
          <n-button size="small" @click="selectZipFile">
            {{ t("hub.batch.selectFile") }}
          </n-button>
          <n-text v-if="zipFilePath" depth="3" style="font-size: 13px">
            {{ zipFilePath.split(/[\\/]/).pop() }}
          </n-text>
        </n-flex>
      </n-flex>

      <n-button
        type="primary"
        :loading="uploading"
        :disabled="!zipFilePath"
        @click="onSubmit"
      >
        {{ t("hub.batch.submit") }}
      </n-button>

      <!-- Results -->
      <template v-if="done">
        <n-text
          :type="failed > 0 ? 'error' : 'success'"
          style="font-size: 14px"
        >
          {{ t("hub.batch.result", { total, created, failed }) }}
        </n-text>
        <n-data-table
          v-if="results.length"
          :columns="columns"
          :data="results"
          :bordered="true"
          size="small"
          style="max-height: 300px"
        />
      </template>
    </n-flex>
  </list-view-page>
</template>
