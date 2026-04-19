<script setup lang="ts">
import { useHubStore } from "@/stores/hub";
import { uploadMap, fetchTags } from "@/services/hub";
import { message } from "@/utils/ui/feedback";
import {
  NButton,
  NFlex,
  NInput,
  NTag,
  NText
} from "naive-ui";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ListViewPage from "../components/ListViewPage.vue";

const { t } = useI18n();
const hub = useHubStore();

const name = ref("");
const author = ref("");
const description = ref("");
const difficulty = ref(0);
const quality = ref(0);
const duration = ref(0);
const selectedTags = ref<string[]>([]);
const customTagInput = ref("");
const mapFilePath = ref("");
const previewPaths = ref<string[]>([]);
const uploading = ref(false);

const availableTags = ref<HubTagCount[]>([]);

onMounted(async () => {
  try {
    availableTags.value = await fetchTags();
  } catch {
    /* ignore */
  }
});

const toggleTag = (tag: string) => {
  const idx = selectedTags.value.indexOf(tag);
  if (idx >= 0) selectedTags.value.splice(idx, 1);
  else selectedTags.value.push(tag);
};

const addCustomTag = () => {
  const tag = customTagInput.value.trim();
  if (!tag || selectedTags.value.includes(tag)) return;
  selectedTags.value.push(tag);
  customTagInput.value = "";
};

const removeTag = (tag: string) => {
  const idx = selectedTags.value.indexOf(tag);
  if (idx >= 0) selectedTags.value.splice(idx, 1);
};

const selectMapFile = async () => {
  const files = await browseFile({
    title: t("hub.upload.selectMap"),
    multiple: false,
    filters: [
      { name: "Map", extensions: ["nmo", "cmo", "zip", "rar"] }
    ]
  });
  if (files) mapFilePath.value = files;
};

const selectPreviewFiles = async () => {
  const files = await browseFile({
    title: t("hub.upload.selectPreview"),
    multiple: true,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }]
  });
  if (files) {
    previewPaths.value = Array.isArray(files) ? files : [files];
  }
};

const onSubmit = async () => {
  if (!name.value.trim() || !author.value.trim() || !mapFilePath.value) {
    message.error(t("hub.upload.required"));
    return;
  }

  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append("name", name.value);
    fd.append("author", author.value);
    if (description.value) fd.append("description", description.value);
    fd.append("difficulty", String(difficulty.value));
    fd.append("quality", String(quality.value));
    fd.append("duration", String(duration.value));
    fd.append("tags", JSON.stringify(selectedTags.value));
    fd.append("map_file", mapFilePath.value);
    previewPaths.value.forEach(p => fd.append("preview_images", p));

    await uploadMap(fd);
    message.success(t("hub.upload.success", { name: name.value }));

    // Reset form
    name.value = "";
    author.value = "";
    description.value = "";
    difficulty.value = 0;
    quality.value = 0;
    duration.value = 0;
    selectedTags.value = [];
    mapFilePath.value = "";
    previewPaths.value = [];
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
      {{ t("hub.upload.title") }}
    </template>

    <template #actions />

    <n-flex
      v-if="!hub.isAuthenticated"
      justify="center"
      style="padding: 40px"
    >
      <n-text depth="3">{{ t("hub.upload.noAuth") }}</n-text>
    </n-flex>

    <n-flex v-else vertical :size="16" style="padding: 16px">
      <!-- Name -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.name") }} *</n-text>
        <n-input v-model:value="name" />
      </n-flex>

      <!-- Author -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.author") }} *</n-text>
        <n-input v-model:value="author" />
      </n-flex>

      <!-- Description -->
      <n-flex vertical :size="4">
        <n-text depth="2">
          {{ t("hub.upload.description") }}
        </n-text>
        <n-input
          v-model:value="description"
          type="textarea"
          :rows="3"
        />
      </n-flex>

      <!-- Difficulty -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.difficulty") }}</n-text>
        <n-flex :size="8">
          <n-button
            v-for="d in [0, 1, 2, 3, 4, 5]"
            :key="d"
            size="small"
            :type="difficulty === d ? 'primary' : 'default'"
            @click="difficulty = d"
          >
            {{ d === 0 ? t("hub.upload.none") : d }}
          </n-button>
        </n-flex>
      </n-flex>

      <!-- Quality -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.quality") }}</n-text>
        <n-flex :size="8">
          <n-button
            v-for="q in [0, 1, 2, 3, 4, 5]"
            :key="q"
            size="small"
            :type="quality === q ? 'primary' : 'default'"
            @click="quality = q"
          >
            {{ q === 0 ? t("hub.upload.none") : q }}
          </n-button>
        </n-flex>
      </n-flex>

      <!-- Duration -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.duration") }}</n-text>
        <n-flex :size="8">
          <n-button
            v-for="du in [0, 1, 2, 3, 4, 5]"
            :key="du"
            size="small"
            :type="duration === du ? 'primary' : 'default'"
            @click="duration = du"
          >
            {{ du === 0 ? t("hub.upload.none") : du }}
          </n-button>
        </n-flex>
      </n-flex>

      <!-- Tags -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.tags") }}</n-text>
        <n-flex :size="6" :wrap="true">
          <n-tag
            v-for="tag in selectedTags"
            :key="tag"
            closable
            size="small"
            @close="removeTag(tag)"
          >
            {{ tag }}
          </n-tag>
        </n-flex>
        <n-flex :size="6" :wrap="true">
          <n-tag
            v-for="tag in availableTags.filter(
              t => !selectedTags.includes(t.name)
            )"
            :key="tag.name"
            size="small"
            style="cursor: pointer"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </n-tag>
        </n-flex>
        <n-flex :size="8">
          <n-input
            v-model:value="customTagInput"
            :placeholder="t('hub.upload.customTag')"
            style="width: 200px"
            @keyup.enter="addCustomTag"
          />
          <n-button size="small" @click="addCustomTag">
            {{ t("hub.upload.addTag") }}
          </n-button>
        </n-flex>
      </n-flex>

      <!-- Map file -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.mapFile") }} *</n-text>
        <n-flex :size="8" align="center">
          <n-button size="small" @click="selectMapFile">
            {{ t("hub.upload.selectFile") }}
          </n-button>
          <n-text v-if="mapFilePath" depth="3" style="font-size: 13px">
            {{ mapFilePath.split(/[\\/]/).pop() }}
          </n-text>
        </n-flex>
      </n-flex>

      <!-- Preview images -->
      <n-flex vertical :size="4">
        <n-text depth="2">{{ t("hub.upload.previewImages") }}</n-text>
        <n-flex :size="8" align="center">
          <n-button size="small" @click="selectPreviewFiles">
            {{ t("hub.upload.selectFile") }}
          </n-button>
          <n-text
            v-if="previewPaths.length"
            depth="3"
            style="font-size: 13px"
          >
            {{ previewPaths.length }} {{ t("hub.upload.files") }}
          </n-text>
        </n-flex>
      </n-flex>

      <!-- Submit -->
      <n-button
        type="primary"
        :loading="uploading"
        :disabled="!name.trim() || !author.trim() || !mapFilePath"
        @click="onSubmit"
      >
        {{ t("hub.upload.submit") }}
      </n-button>
    </n-flex>
  </list-view-page>
</template>
