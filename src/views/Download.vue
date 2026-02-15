<script setup lang="ts">
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
  NText,
  NThing,
  NSpace
} from "naive-ui";
import { computed, onMounted, ref, h } from "vue";
import ListViewPage from "./components/ListViewPage.vue";
import BasicIcon from "./components/MgcIcon.vue";

const { t } = useI18n();
const downloadService = useDownloadService();
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

// 下载状态
const showDownloadModal = ref(false);
const downloadingMapName = ref("");
const downloadingStatus = ref<
  "downloading" | "extracting" | "completed" | "failed"
>("downloading");
const downloadProgress = ref(0); // 下载进度百分比

// 检查地图是否正在下载
const isMapDownloading = (mapId: string) => {
  return downloadService.isDownloading(mapId);
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
    data.value = await downloadService.getMapIndexes();
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
const onDownloadMap = (map: BallanceMap) => {
  // 检查是否已选择实例
  if (!app.selectedInstanceData) {
    message.error(t("download.noInstance"));
    return;
  }

  // 检查是否已经在下载中
  if (isMapDownloading(map.id)) {
    message.warning(t("common.message.warning"));
    return;
  }

  selectedMap.value = map;
  downloadingMapName.value = map.name.replace(/\..+$/g, "");
  downloadingStatus.value = "downloading";
  downloadProgress.value = 0;
  showDownloadModal.value = true;

  loadingBar.start();

  // 不 await，让下载在后台运行，但通过模态框阻止用户离开
  downloadService
    .downloadMap(
      map,
      app.selectedInstanceData.path,
      (progress, status, error) => {
        // 更新下载进度
        if (status === "downloading") {
          downloadProgress.value = progress;
        } else if (status === "extracting") {
          downloadingStatus.value = "extracting";
          downloadProgress.value = 100;
        } else if (status === "completed") {
          downloadingStatus.value = "completed";
          downloadProgress.value = 100;
          loadingBar.finish();
          message.success(t("download.success", { name: map.name }));

          // 延迟关闭模态框，让用户看到成功提示
          setTimeout(() => {
            showDownloadModal.value = false;
          }, 1500);
        } else if (status === "failed") {
          downloadingStatus.value = "failed";
          loadingBar.error();
          message.error(t("common.message.error"));

          // 延迟关闭模态框，让用户看到错误提示
          setTimeout(() => {
            showDownloadModal.value = false;
          }, 3000);
        }
      }
    )
    .catch(error => {
      // 捕获未在回调中处理的错误
      console.error("Download error:", error);
    });
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

    <n-spin :show="loading" style="min-height: 400px">
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
              :loading="isMapDownloading(map.id)"
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
      style="width: 650px"
    >
      <n-thing v-if="selectedMap">
        <template #header>
          <n-flex vertical :size="4">
            <n-text style="font-size: 18px; font-weight: 600">
              {{ selectedMap.name.replace(/\..+$/g, "") }}
            </n-text>
            <n-tag v-if="selectedMap.author" type="primary" size="small">
              {{ selectedMap.author }}
            </n-tag>
          </n-flex>
        </template>

        <template #description>
          <n-text v-if="selectedMap.description" depth="2">
            {{ selectedMap.description }}
          </n-text>
          <n-text v-else depth="3">{{ t("download.noDescription") }}</n-text>
        </template>

        <template #footer>
          <n-space vertical :size="16">
            <!-- 基本信息 -->
            <n-descriptions
              :column="2"
              label-style="width: 80px; font-weight: 500"
            >
              <n-descriptions-item :label="t('download.difficulty')">
                <n-tag
                  v-if="selectedMap.difficulty"
                  type="warning"
                  size="small"
                >
                  {{ selectedMap.difficulty }}
                </n-tag>
                <n-text v-else depth="3">{{ t("common.unknown") }}</n-text>
              </n-descriptions-item>
              <n-descriptions-item :label="t('download.format')">
                <n-tag size="small">{{
                  selectedMap.format.toUpperCase()
                }}</n-tag>
              </n-descriptions-item>
              <n-descriptions-item :label="t('download.publishTime')" :span="2">
                <n-text depth="2">
                  {{ new Date(selectedMap.publishTime).toLocaleDateString() }}
                </n-text>
              </n-descriptions-item>
            </n-descriptions>

            <!-- 标签 -->
            <n-flex v-if="selectedMap.tags.length" :size="8" align="center">
              <n-tag
                v-for="tag in selectedMap.tags"
                :key="tag"
                type="info"
                size="small"
                round
              >
                {{ tag }}
              </n-tag>
            </n-flex>
            <n-text v-else depth="3">{{ t("common.none") }}</n-text>

            <!-- 操作按钮 -->
            <n-flex justify="flex-end" :size="12">
              <n-button @click="showDetailModal = false">
                {{ t("common.dialog.cancel") }}
              </n-button>
              <n-button
                type="primary"
                :loading="isMapDownloading(selectedMap.id)"
                @click="
                  showDetailModal = false;
                  onDownloadMap(selectedMap);
                "
              >
                <template #icon>
                  <BasicIcon icon="download-2-line" />
                </template>
                {{ t("common.action.download") }}
              </n-button>
            </n-flex>
          </n-space>
        </template>
      </n-thing>
    </n-modal>

    <!-- 下载进度模态框 -->
    <n-modal
      v-model:show="showDownloadModal"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
      :auto-focus="false"
      preset="card"
      style="width: 500px"
    >
      <n-flex vertical :size="24" align="center">
        <n-spin
          v-if="
            downloadingStatus === 'downloading' ||
            downloadingStatus === 'extracting'
          "
          size="large"
        />
        <BasicIcon
          v-else-if="downloadingStatus === 'completed'"
          icon="check-circle-fill"
          size="large"
          color="#18a058"
          style="font-size: 64px"
        />
        <BasicIcon
          v-else-if="downloadingStatus === 'failed'"
          icon="close-circle-fill"
          size="large"
          color="#d03050"
          style="font-size: 64px"
        />

        <n-flex vertical :size="8" align="center">
          <n-text
            v-if="downloadingStatus === 'downloading' && downloadProgress === 0"
            style="font-size: 16px; font-weight: 500"
          >
            {{
              t("download.downloadingPreparing", { name: downloadingMapName })
            }}
          </n-text>
          <n-text
            v-else-if="downloadingStatus === 'downloading'"
            style="font-size: 16px; font-weight: 500"
          >
            {{ t("download.downloading", { name: downloadingMapName }) }}
          </n-text>
          <n-text
            v-else-if="downloadingStatus === 'extracting'"
            style="font-size: 16px; font-weight: 500"
          >
            {{ t("download.extracting", { name: downloadingMapName }) }}
          </n-text>
          <n-text
            v-else-if="downloadingStatus === 'completed'"
            style="font-size: 16px; font-weight: 500; color: #18a058"
          >
            {{ t("download.success", { name: downloadingMapName }) }}
          </n-text>
          <n-text
            v-else-if="downloadingStatus === 'failed'"
            style="font-size: 16px; font-weight: 500; color: #d03050"
          >
            {{ t("common.message.error") }}
          </n-text>

          <n-text
            v-if="downloadingStatus === 'downloading' && downloadProgress > 0"
            depth="3"
            style="font-size: 13px"
          >
            {{ downloadProgress }}%
          </n-text>
          <n-text
            v-else-if="downloadingStatus === 'extracting'"
            depth="3"
            style="font-size: 13px"
          >
            {{ t("download.extractingTip") }}
          </n-text>
        </n-flex>
      </n-flex>
    </n-modal>
  </list-view-page>
</template>
