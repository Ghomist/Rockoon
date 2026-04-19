<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { useHubStore } from "@/stores/hub";
import backend from "@/backend";
import {
  fetchMaps,
  fetchMap,
  fetchTags,
  getDownloadUrl,
  updateMap,
  uploadVersion,
  addPreview,
  deletePreview,
  deleteMap
} from "@/services/hub";
import { dialog, loadingBar, message } from "@/utils/ui/feedback";
import {
  NButton,
  NCard,
  NFlex,
  NInput,
  NModal,
  NScrollbar,
  NSelect,
  NSpin,
  NTag,
  NText
} from "naive-ui";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { computed, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import BasicIcon from "../components/MgcIcon.vue";

const { t } = useI18n();
const route = useRoute();
const app = useAppStore();
const hub = useHubStore();

const PAGE_SIZE = 20;

const loading = ref(true);
const maps = ref<HubMapResponse[]>([]);
const total = ref(0);
const page = ref(1);
const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE));

const tags = ref<HubTagCount[]>([]);
const selectedTags = ref<string[]>([]);
const searchName = ref("");
const searchAuthor = ref((route.query.author as string) || "");

const ratingOptions = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 }
];

const difficultyFilter = ref<number | null>(null);
const qualityFilter = ref<number | null>(null);
const durationFilter = ref<number | null>(null);

const tagOptions = computed(() => [
  ...tags.value.map(tag => ({
    label: `${tag.name} (${tag.count})`,
    value: tag.name
  }))
]);

const onTagsChange = (val: string[]) => {
  selectedTags.value = val;
  page.value = 1;
  loadMaps();
};

const onFilterChange = () => {
  page.value = 1;
  loadMaps();
};

// Download modal
const showDownloadModal = ref(false);
const downloadingMapName = ref("");
const downloadingStatus = ref<"downloading" | "completed" | "failed">("downloading");

// Detail modal
const showDetailModal = ref(false);
const selectedMap = ref<HubMapResponse>();

// Edit state
const editing = ref(false);
const editName = ref("");
const editAuthor = ref("");
const editDescription = ref("");
const editDifficulty = ref(0);
const editQuality = ref(0);
const editDuration = ref(0);
const editTags = ref<string[]>([]);
const editTagInput = ref("");
const saving = ref(false);
const uploadingVersion = ref(false);
const uploadingPreview = ref(false);

const editRatingOptions = computed(() => [
  { label: t("hub.maps.editNone"), value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 }
]);

const editTagOptions = computed(() =>
  tags.value
    .filter(tag => !editTags.value.includes(tag.name))
    .map(tag => ({ label: `${tag.name} (${tag.count})`, value: tag.name }))
);

const startEdit = () => {
  if (!selectedMap.value) return;
  editName.value = selectedMap.value.name;
  editAuthor.value = selectedMap.value.author;
  editDescription.value = selectedMap.value.description || "";
  editDifficulty.value = selectedMap.value.difficulty;
  editQuality.value = selectedMap.value.quality;
  editDuration.value = selectedMap.value.duration;
  editTags.value = [...selectedMap.value.tags];
  editTagInput.value = "";
  editing.value = true;
};

const addEditTag = () => {
  const tag = editTagInput.value.trim();
  if (!tag || editTags.value.includes(tag)) return;
  editTags.value.push(tag);
  editTagInput.value = "";
};

const removeEditTag = (tag: string) => {
  const idx = editTags.value.indexOf(tag);
  if (idx >= 0) editTags.value.splice(idx, 1);
};

const saveEdit = async () => {
  if (!selectedMap.value || saving.value) return;
  saving.value = true;
  try {
    const data: Record<string, unknown> = {};
    if (editName.value !== selectedMap.value.name) data.name = editName.value;
    if (editAuthor.value !== selectedMap.value.author) data.author = editAuthor.value;
    if (editDescription.value !== (selectedMap.value.description || "")) data.description = editDescription.value || null;
    if (editDifficulty.value !== selectedMap.value.difficulty) data.difficulty = editDifficulty.value;
    if (editQuality.value !== selectedMap.value.quality) data.quality = editQuality.value;
    if (editDuration.value !== selectedMap.value.duration) data.duration = editDuration.value;
    if (JSON.stringify(editTags.value) !== JSON.stringify(selectedMap.value.tags)) data.tags = editTags.value;

    if (Object.keys(data).length > 0) {
      const result = await updateMap(selectedMap.value.id, data);
      selectedMap.value = result;
      // update card in list
      const idx = maps.value.findIndex(m => m.id === result.id);
      if (idx >= 0) maps.value[idx] = result;
    }
    editing.value = false;
    message.success(t("hub.maps.editSaved"));
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : t("common.message.error"));
  } finally {
    saving.value = false;
  }
};

const handleUploadVersion = async () => {
  if (!selectedMap.value) return;
  const files = await browseFile({
    title: t("hub.maps.selectVersionFile"),
    multiple: false,
    filters: [{ name: "Map", extensions: ["nmo", "cmo", "zip", "rar"] }]
  });
  if (!files) return;
  uploadingVersion.value = true;
  try {
    const fd = new FormData();
    fd.append("map_file", files);
    await uploadVersion(selectedMap.value.id, fd);
    selectedMap.value = await fetchMap(selectedMap.value.id);
    message.success(t("hub.maps.versionUploaded"));
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : t("common.message.error"));
  } finally {
    uploadingVersion.value = false;
  }
};

const handleAddPreview = async () => {
  if (!selectedMap.value) return;
  const files = await browseFile({
    title: t("hub.maps.selectPreviewFile"),
    multiple: true,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }]
  });
  if (!files) return;
  const fileArr = Array.isArray(files) ? files : [files];
  uploadingPreview.value = true;
  try {
    for (const f of fileArr) {
      const fd = new FormData();
      fd.append("preview_image", f);
      await addPreview(selectedMap.value.id, fd);
    }
    selectedMap.value = await fetchMap(selectedMap.value.id);
    message.success(t("hub.maps.previewAdded"));
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : t("common.message.error"));
  } finally {
    uploadingPreview.value = false;
  }
};

const handleDeletePreview = async (index: number) => {
  if (!selectedMap.value) return;
  const url = selectedMap.value.preview_images[index];
  const filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  try {
    await deletePreview(selectedMap.value.id, filename);
    selectedMap.value = await fetchMap(selectedMap.value.id);
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : t("common.message.error"));
  }
};

const handleDeleteMap = () => {
  if (!selectedMap.value) return;
  dialog.warning({
    title: t("common.message.warning"),
    content: t("hub.maps.deleteConfirm", { name: selectedMap.value.name }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      try {
        await deleteMap(selectedMap.value!.id);
        showDetailModal.value = false;
        editing.value = false;
        await loadMaps();
        message.success(t("hub.maps.deleteSuccess"));
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : t("common.message.error"));
      }
    }
  });
};

const loadTags = async () => {
  try {
    tags.value = await fetchTags();
  } catch {
    /* ignore */
  }
};

const loadMaps = async () => {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      skip: (page.value - 1) * PAGE_SIZE,
      limit: PAGE_SIZE
    };
    if (searchName.value) params.name = searchName.value;
    if (searchAuthor.value) params.author = searchAuthor.value;
    if (selectedTags.value.length) params.tags = selectedTags.value.join(",");
    if (difficultyFilter.value) {
      params.min_difficulty = difficultyFilter.value;
      params.max_difficulty = difficultyFilter.value;
    }
    if (qualityFilter.value) {
      params.min_quality = qualityFilter.value;
      params.max_quality = qualityFilter.value;
    }
    if (durationFilter.value) {
      params.min_duration = durationFilter.value;
      params.max_duration = durationFilter.value;
    }

    const data = await fetchMaps(params as Parameters<typeof fetchMaps>[0]);
    maps.value = data.items;
    total.value = data.total;
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : t("common.message.error"));
  } finally {
    loading.value = false;
  }
};

const onSearch = useDebounceFn(() => {
  page.value = 1;
  loadMaps();
}, 300);

watch([searchName, searchAuthor], () => onSearch());

const onShowDetail = (map: HubMapResponse) => {
  selectedMap.value = map;
  editing.value = false;
  showDetailModal.value = true;
};

const onDownloadMap = async (map: HubMapResponse) => {
  if (!app.selectedInstanceData) {
    message.error(t("download.noInstance"));
    return;
  }

  downloadingMapName.value = map.name;
  downloadingStatus.value = "downloading";
  showDownloadModal.value = true;
  loadingBar.start();

  try {
    const { download_url } = await getDownloadUrl(map.id);
    const mapsDir = await join(app.selectedInstanceData.path, "ModLoader", "Maps");
    const savePath = await join(mapsDir, `${map.name}.nmo`);
    await backend.downloadFile(download_url, savePath);
    downloadingStatus.value = "completed";
    loadingBar.finish();
    message.success(t("download.success", { name: map.name }));
    setTimeout(() => { showDownloadModal.value = false; }, 1500);
  } catch (e: unknown) {
    downloadingStatus.value = "failed";
    loadingBar.error();
    message.error(t("common.message.error"));
    setTimeout(() => { showDownloadModal.value = false; }, 3000);
  }
};

const browseAuthor = (author: string) => {
  searchAuthor.value = author;
  onSearch();
};

watch(
  () => route.query.author,
  val => {
    if (val && typeof val === "string") {
      searchAuthor.value = val;
      onSearch();
    }
  }
);

onMounted(async () => {
  await Promise.all([loadTags(), loadMaps()]);
});
</script>

<template>
  <n-flex vertical style="height: 100%">
    <!-- Header: filters -->
    <n-flex vertical :size="8" style="padding: 12px 16px; flex-shrink: 0">
      <!-- Row 1: title + search -->
      <n-flex :size="8" align="center" justify="space-between">
        <n-text style="font-weight: 500">
          {{ t("hub.maps.title", { cnt: total }, total) }}
        </n-text>
        <n-flex :size="8">
          <n-input
            v-model:value="searchName"
            clearable
            size="small"
            style="width: 140px"
            :placeholder="t('hub.maps.searchName')"
          />
          <n-input
            v-model:value="searchAuthor"
            clearable
            size="small"
            style="width: 120px"
            :placeholder="t('hub.maps.searchAuthor')"
          />
        </n-flex>
      </n-flex>

      <!-- Row 2: select filters -->
      <n-flex :size="8" :wrap="true">
        <n-select
          v-model:value="selectedTags"
          :options="tagOptions"
          multiple
          size="small"
          :placeholder="t('hub.maps.tagFilter')"
          clearable
          max-tag-count="responsive"
          style="min-width: 200px; max-width: 360px"
          @update:value="onTagsChange"
        />
        <n-select
          v-model:value="difficultyFilter"
          :options="ratingOptions"
          size="small"
          :placeholder="t('hub.maps.difficulty')"
          clearable
          style="width: 100px"
          @update:value="onFilterChange"
        />
        <n-select
          v-model:value="qualityFilter"
          :options="ratingOptions"
          size="small"
          :placeholder="t('hub.maps.quality')"
          clearable
          style="width: 100px"
          @update:value="onFilterChange"
        />
        <n-select
          v-model:value="durationFilter"
          :options="ratingOptions"
          size="small"
          :placeholder="t('hub.maps.duration')"
          clearable
          style="width: 100px"
          @update:value="onFilterChange"
        />
      </n-flex>
    </n-flex>

    <!-- Card grid -->
    <n-scrollbar style="flex: 1">
      <n-spin :show="loading" style="min-height: 200px">
        <div v-if="!loading && maps.length === 0" style="text-align: center; padding: 60px 0">
          <n-text depth="3">{{ t("hub.maps.empty") }}</n-text>
        </div>
        <div v-else class="hub-map-grid">
          <n-card
            v-for="map in maps"
            :key="map.id"
            hoverable
            size="small"
            style="cursor: pointer"
            @click="onShowDetail(map)"
          >
            <template #cover>
              <div class="hub-card-cover">
                <img
                  v-if="map.preview_images.length"
                  :src="map.preview_images[0]"
                  class="hub-card-img"
                />
                <BasicIcon v-else icon="map-line" style="font-size: 32px; opacity: 0.2" />
              </div>
            </template>

            <n-flex vertical :size="4">
              <n-text
                style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                :title="map.name"
              >
                {{ map.name }}
              </n-text>
              <n-flex :size="6" align="center">
                <n-tag size="tiny" :bordered="false" type="primary" style="cursor: pointer" @click.stop="browseAuthor(map.author)">
                  {{ map.author }}
                </n-tag>
                <n-text v-if="map.difficulty" depth="3" style="font-size: 12px">
                  {{ "★".repeat(map.difficulty) }}
                </n-text>
              </n-flex>
              <n-flex v-if="map.tags.length" :size="4" :wrap="true">
                <n-tag v-for="tag in map.tags.slice(0, 3)" :key="tag" size="tiny" round>
                  {{ tag }}
                </n-tag>
                <n-tag v-if="map.tags.length > 3" size="tiny" round depth="3">
                  +{{ map.tags.length - 3 }}
                </n-tag>
              </n-flex>
            </n-flex>
          </n-card>
        </div>
      </n-spin>
    </n-scrollbar>

    <!-- Pagination -->
    <n-flex v-if="totalPages > 1" justify="center" :size="8" style="padding: 8px; flex-shrink: 0">
      <n-button :disabled="page <= 1" size="small" @click="page--; loadMaps()">
        {{ t("hub.maps.prev") }}
      </n-button>
      <n-text depth="3" style="line-height: 28px">
        {{ page }} / {{ totalPages }}
      </n-text>
      <n-button :disabled="page >= totalPages" size="small" @click="page++; loadMaps()">
        {{ t("hub.maps.next") }}
      </n-button>
    </n-flex>

    <!-- Detail modal -->
    <n-modal
      v-model:show="showDetailModal"
      preset="card"
      :title="t('download.detailModal')"
      style="width: 620px"
    >
      <n-flex v-if="selectedMap" vertical :size="12">
        <!-- Top bar: name + edit toggle -->
        <n-flex justify="space-between" align="center">
          <n-text v-if="!editing" style="font-size: 18px; font-weight: 600">
            {{ selectedMap.name }}
          </n-text>
          <n-input v-else v-model:value="editName" style="flex: 1" />
          <n-flex v-if="hub.isAuthenticated" :size="6" :wrap="false">
            <n-button v-if="!editing" size="small" secondary @click="startEdit">
              {{ t("hub.maps.edit") }}
            </n-button>
            <n-button v-else size="small" @click="editing = false">
              {{ t("common.dialog.cancel") }}
            </n-button>
          </n-flex>
        </n-flex>

        <!-- ========== Edit mode ========== -->
        <template v-if="editing">
          <n-flex vertical :size="8">
            <n-flex vertical :size="2">
              <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.editAuthor") }}</n-text>
              <n-input v-model:value="editAuthor" />
            </n-flex>
            <n-flex vertical :size="2">
              <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.editDesc") }}</n-text>
              <n-input v-model:value="editDescription" type="textarea" :rows="2" />
            </n-flex>
            <n-flex :size="12">
              <n-flex vertical :size="2" style="flex: 1">
                <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.difficulty") }}</n-text>
                <n-select v-model:value="editDifficulty" :options="editRatingOptions" size="small" />
              </n-flex>
              <n-flex vertical :size="2" style="flex: 1">
                <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.quality") }}</n-text>
                <n-select v-model:value="editQuality" :options="editRatingOptions" size="small" />
              </n-flex>
              <n-flex vertical :size="2" style="flex: 1">
                <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.duration") }}</n-text>
                <n-select v-model:value="editDuration" :options="editRatingOptions" size="small" />
              </n-flex>
            </n-flex>
            <n-flex vertical :size="2">
              <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.editTags") }}</n-text>
              <n-flex :size="4" :wrap="true">
                <n-tag v-for="tag in editTags" :key="tag" size="small" closable @close="removeEditTag(tag)">{{ tag }}</n-tag>
              </n-flex>
              <n-flex :size="6" align="center">
                <n-select
                  :options="editTagOptions"
                  size="small"
                  :placeholder="t('hub.maps.tagFilter')"
                  clearable
                  style="flex: 1"
                  @update:value="(v: string) => { if (v && !editTags.includes(v)) editTags.push(v) }"
                />
                <n-input
                  v-model:value="editTagInput"
                  size="small"
                  style="width: 140px"
                  :placeholder="t('hub.maps.customTag')"
                  @keyup.enter="addEditTag"
                />
                <n-button size="small" @click="addEditTag">{{ t("hub.maps.addTag") }}</n-button>
              </n-flex>
            </n-flex>
          </n-flex>

          <!-- Preview management -->
          <n-flex vertical :size="4">
            <n-text depth="3" style="font-size: 12px">{{ t("hub.maps.editPreviews") }}</n-text>
            <n-flex v-if="selectedMap.preview_images.length" :size="6" :wrap="true">
              <div v-for="(img, i) in selectedMap.preview_images" :key="i" style="position: relative">
                <img :src="img" style="width: 100px; height: 68px; object-fit: cover; border-radius: 4px" />
                <n-button
                  size="tiny"
                  circle
                  type="error"
                  style="position: absolute; top: -4px; right: -4px"
                  @click="handleDeletePreview(i)"
                >
                  <template #icon><BasicIcon icon="close-line" /></template>
                </n-button>
              </div>
            </n-flex>
            <n-text v-else depth="3" style="font-size: 12px">{{ t("hub.maps.noPreview") }}</n-text>
            <n-flex :size="8">
              <n-button size="small" :loading="uploadingPreview" @click="handleAddPreview">
                {{ t("hub.maps.addPreview") }}
              </n-button>
            </n-flex>
          </n-flex>

          <!-- Upload new version -->
          <n-flex vertical :size="4">
            <n-text depth="3" style="font-size: 12px">
              {{ t("hub.maps.currentVersion", { v: selectedMap.current_version || 1 }) }}
            </n-text>
            <n-button size="small" :loading="uploadingVersion" @click="handleUploadVersion">
              {{ t("hub.maps.uploadVersion") }}
            </n-button>
          </n-flex>

          <!-- Save / Delete -->
          <n-flex justify="space-between">
            <n-button size="small" type="error" @click="handleDeleteMap">
              {{ t("hub.maps.deleteMap") }}
            </n-button>
            <n-button type="primary" :loading="saving" @click="saveEdit">
              {{ t("hub.maps.save") }}
            </n-button>
          </n-flex>
        </template>

        <!-- ========== View mode ========== -->
        <template v-else>
          <n-flex :size="8" align="center">
            <n-tag type="primary" size="small" style="cursor: pointer" @click="browseAuthor(selectedMap.author)">
              {{ selectedMap.author }}
            </n-tag>
            <n-tag v-if="selectedMap.difficulty" type="warning" size="small">
              {{ "★".repeat(selectedMap.difficulty) }}
            </n-tag>
            <n-tag v-if="selectedMap.quality" size="small">{{ t("hub.maps.quality") }} {{ selectedMap.quality }}</n-tag>
            <n-tag v-if="selectedMap.duration" size="small">{{ t("hub.maps.duration") }} {{ selectedMap.duration }}</n-tag>
            <n-text v-if="selectedMap.current_version" depth="3" style="font-size: 12px">
              v{{ selectedMap.current_version }}
            </n-text>
          </n-flex>
          <n-text v-if="selectedMap.description" depth="2">{{ selectedMap.description }}</n-text>
          <n-text v-else depth="3">{{ t("download.noDescription") }}</n-text>
          <n-flex v-if="selectedMap.tags.length" :size="6">
            <n-tag v-for="tag in selectedMap.tags" :key="tag" size="small" round>{{ tag }}</n-tag>
          </n-flex>
          <n-text depth="3" style="font-size: 12px">
            {{ new Date(selectedMap.created_at).toLocaleDateString() }}
          </n-text>
          <n-flex v-if="selectedMap.preview_images.length" :size="8" :wrap="true">
            <img
              v-for="(img, i) in selectedMap.preview_images"
              :key="i"
              :src="img"
              style="width: 120px; height: 80px; object-fit: cover; border-radius: 4px"
            />
          </n-flex>
        </template>
      </n-flex>

      <template #footer>
        <n-flex v-if="!editing" justify="end" :size="12">
          <n-button @click="showDetailModal = false">{{ t("common.dialog.cancel") }}</n-button>
          <n-button type="primary" @click="showDetailModal = false; selectedMap && onDownloadMap(selectedMap)">
            <template #icon><BasicIcon icon="download-2-line" /></template>
            {{ t("common.action.download") }}
          </n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- Download progress modal -->
    <n-modal
      v-model:show="showDownloadModal"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
      :auto-focus="false"
      preset="card"
      style="width: 400px"
    >
      <n-flex vertical :size="16" align="center">
        <n-spin v-if="downloadingStatus === 'downloading'" size="large" />
        <BasicIcon v-else-if="downloadingStatus === 'completed'" icon="check-circle-fill" style="font-size: 64px; color: #18a058" />
        <BasicIcon v-else-if="downloadingStatus === 'failed'" icon="close-circle-fill" style="font-size: 64px; color: #d03050" />
        <n-text style="font-size: 16px; font-weight: 500">
          {{
            downloadingStatus === "downloading"
              ? t("download.downloadingPreparing", { name: downloadingMapName })
              : downloadingStatus === "completed"
                ? t("download.success", { name: downloadingMapName })
                : t("common.message.error")
          }}
        </n-text>
      </n-flex>
    </n-modal>
  </n-flex>
</template>

<style scoped>
.hub-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 0 16px 12px;
}
.hub-card-cover {
  height: 120px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(128, 128, 128, 0.06);
}
.hub-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
