<script setup lang="ts">
import backend from "@/backend";
import { useDownloadService } from "@/services/download";
import { useAppStore } from "@/stores/app";
import { loadingBar, message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
import {
  NButton,
  NFlex,
  NListItem,
  NTag,
  NSpin,
  NInput,
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NText
} from "naive-ui";
import { computed, onMounted, ref } from "vue";
import ListViewPage from "./components/ListViewPage.vue";
import BasicIcon from "./components/MgcIcon.vue";
import { join } from "@tauri-apps/api/path";

const { t } = useI18n();
const download = useDownloadService();
const app = useAppStore();

const PAGE_SIZE = 30; // 每页加载的地图数量

const loading = ref(true);
const loadingMore = ref(false); // 是否正在加载更多
const data = ref<BallanceMapsResponse>();
const displayCount = ref(PAGE_SIZE); // 当前显示的地图数量
const searchKeyword = ref(""); // 搜索关键词

// 详情弹窗
const showDetailModal = ref(false);
const selectedMap = ref<BallanceMap | undefined>();
const isDownloading = ref(false);

// 构建地图下载 URL
const buildDownloadUrl = (map: BallanceMap) => {
  return `https://dl.bcrc.site/map/${map.id}`;
};

// 当前显示的地图列表（分页 + 筛选后的）
const displayedMaps = computed(() => {
  if (!data.value?.maps) return [];

  let filteredMaps = data.value.maps;

  // 应用搜索筛选
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase().trim();
    filteredMaps = filteredMaps.filter(map => {
      const nameWithoutExt = map.name.replace(/\..+$/g, "").toLowerCase();
      const author = map.author?.toLowerCase() ?? "";

      return nameWithoutExt.includes(keyword) || author.includes(keyword);
    });
  }

  return filteredMaps.slice(0, displayCount.value);
});

// 是否还有更多数据可以加载（基于筛选后的结果）
const hasMore = computed(() => {
  if (!data.value?.maps) return false;

  let filteredMaps = data.value.maps;
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase().trim();
    filteredMaps = filteredMaps.filter(map => {
      const nameWithoutExt = map.name.replace(/\..+$/g, "").toLowerCase();
      const author = map.author?.toLowerCase() ?? "";
      return nameWithoutExt.includes(keyword) || author.includes(keyword);
    });
  }

  return displayCount.value < filteredMaps.length;
});

// 搜索变化时重置显示数量
const onSearchChange = () => {
  displayCount.value = PAGE_SIZE;
};

const onRefresh = async () => {
  loading.value = true;
  loadingBar.start();
  try {
    data.value = await download.getMapIndexes();
    displayCount.value = PAGE_SIZE; // 重置显示数量
    searchKeyword.value = ""; // 重置搜索
    loading.value = false;
    loadingBar.finish();
  } catch {
    loadingBar.error();
    message.error(t("common.message.error"));
  }
};

onMounted(async () => {
  await onRefresh();
});

// 显示详情弹窗
const onShowDetail = (map: BallanceMap) => {
  selectedMap.value = map;
  showDetailModal.value = true;
};

// 下载地图
const onDownloadMap = async (map: BallanceMap) => {
  // 检查是否已选择实例
  if (!app.selectedInstanceData) {
    message.error(t("download.noInstance"));
    return;
  }

  selectedMap.value = map;
  isDownloading.value = true;

  const loadingMessage = message.loading(
    t("download.downloading", { name: map.name }),
    { duration: 0 }
  );

  try {
    // 构建下载 URL 和保存路径
    const downloadUrl = buildDownloadUrl(map);
    const mapPath = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Maps",
      map.name
    );

    // 确保地图文件夹存在
    const mapsDir = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Maps"
    );
    await backend.mkdir(mapsDir);

    // 下载文件
    await backend.downloadFile(downloadUrl, mapPath);

    // 如果是 ZIP 文件，解压它
    if (map.format === "zip") {
      const extractDir = await join(mapsDir, map.name.replace(/\.zip$/i, ""));
      await backend.mkdir(extractDir);
      await backend.unzip(mapPath, extractDir);

      // 删除 ZIP 文件
      await backend.delete(mapPath);
    }

    loadingMessage.destroy();
    message.success(t("download.success", { name: map.name }));
  } catch (error) {
    loadingMessage.destroy();
    message.error(t("common.message.error"));
    console.error("Download error:", error);
  } finally {
    isDownloading.value = false;
  }
};

// 处理滚动事件，加载更多数据
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (!target || loadingMore.value || !hasMore.value) return;

  const { scrollTop, scrollHeight, clientHeight } = target;
  // 当滚动到距离底部 200px 时，加载更多
  const threshold = 200;
  if (scrollHeight - scrollTop - clientHeight < threshold) {
    loadMore();
  }
};

// 加载更多数据
const loadMore = () => {
  if (!data.value || loadingMore.value) return;

  loadingMore.value = true;
  // 使用 setTimeout 让 UI 有机会更新加载状态
  setTimeout(() => {
    displayCount.value += PAGE_SIZE;
    loadingMore.value = false;
  }, 100);
};
</script>

<template>
  <list-view-page @scroll="handleScroll">
    <template #title>
      {{
        t(
          "download.title",
          { cnt: data?.maps.length ?? 0 },
          data?.maps.length ?? 0
        )
      }}
    </template>

    <template #actions>
      <n-input
        v-model:value="searchKeyword"
        clearable
        style="width: 200px"
        :placeholder="t('download.searchPlaceholder')"
        @update:value="onSearchChange"
      />
      <n-button @click="onRefresh">
        {{ t("common.action.refresh") }}
      </n-button>
    </template>

    <n-spin :show="loading">
      <n-list-item
        v-for="map in displayedMaps"
        :key="map.id"
        @click="onShowDetail(map)"
      >
        <n-flex vertical :size="4" style="flex: 1; min-width: 0">
          <n-flex align="center" :size="8">
            <span style="font-weight: 500">
              {{ map.name.replace(/\..+$/g, "") }}
            </span>
            <n-tag v-if="map.author" type="primary" size="small">
              {{ map.author }}
            </n-tag>
            <template v-if="map.tags.length">
              <n-tag v-for="tag in map.tags" :key="tag" size="small">
                {{ tag }}
              </n-tag>
            </template>
          </n-flex>
          <n-text v-if="map.description" depth="3" style="font-size: 12px">
            {{ map.description }}
          </n-text>
        </n-flex>

        <template #suffix>
          <n-flex :wrap="false" @click.stop>
            <n-button
              secondary
              type="info"
              size="small"
              @click="onShowDetail(map)"
            >
              {{ t("download.detail") }}
            </n-button>
            <n-button
              secondary
              type="primary"
              size="small"
              :loading="isDownloading && selectedMap?.id === map.id"
              @click="onDownloadMap(map)"
            >
              <template #icon>
                <BasicIcon icon="download-2-line" />
              </template>
              {{ t("common.action.download") }}
            </n-button>
          </n-flex>
        </template>
      </n-list-item>
    </n-spin>

    <!-- 详情弹窗 -->
    <n-modal
      v-model:show="showDetailModal"
      preset="card"
      :title="t('download.detailModal')"
      style="width: 600px"
    >
      <n-descriptions v-if="selectedMap" bordered :column="1">
        <n-descriptions-item :label="t('download.mapName')">
          {{ selectedMap.name.replace(/\..+$/g, "") }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.author')">
          <n-tag v-if="selectedMap.author" type="primary" size="small">
            {{ selectedMap.author }}
          </n-tag>
          <n-text v-else depth="3">-</n-text>
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.description')">
          <n-text v-if="selectedMap.description">
            {{ selectedMap.description }}
          </n-text>
          <n-text v-else depth="3">-</n-text>
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.difficulty')">
          <n-tag v-if="selectedMap.difficulty" type="warning" size="small">
            {{ selectedMap.difficulty }}
          </n-tag>
          <n-text v-else depth="3">-</n-text>
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.format')">
          <n-tag size="small">{{ selectedMap.format.toUpperCase() }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.tags')">
          <n-flex v-if="selectedMap.tags.length" :size="4" align="center">
            <n-tag v-for="tag in selectedMap.tags" :key="tag" size="small">
              {{ tag }}
            </n-tag>
          </n-flex>
          <n-text v-else depth="3">-</n-text>
        </n-descriptions-item>
        <n-descriptions-item :label="t('download.publishTime')">
          {{ new Date(selectedMap.publishTime).toLocaleString() }}
        </n-descriptions-item>
      </n-descriptions>
    </n-modal>
  </list-view-page>
</template>
