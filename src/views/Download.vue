<script setup lang="ts">
import { useDownloadService } from "@/services/download";
import { loadingBar, message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
import { NButton, NFlex, NListItem, NTag, NSpin, NInput } from "naive-ui";
import { computed, onMounted, ref } from "vue";
import ListViewPage from "./components/ListViewPage.vue";
import BasicIcon from "./components/MgcIcon.vue";

const { t } = useI18n();
const download = useDownloadService();

const PAGE_SIZE = 30; // 每页加载的地图数量

const loading = ref(true);
const loadingMore = ref(false); // 是否正在加载更多
const data = ref<BallanceMapsResponse>();
const displayCount = ref(PAGE_SIZE); // 当前显示的地图数量
const searchKeyword = ref(""); // 搜索关键词

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

// 下载地图
const onDownloadMap = async (map: BallanceMap) => {
  // TODO: 实现下载功能
  message.info(`下载地图: ${map.name}`);
};

// 移除地图
const onRemoveMap = async (map: BallanceMap) => {
  // TODO: 实现移除功能
  message.info(`移除地图: ${map.name}`);
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
      <n-list-item v-for="map in displayedMaps" :key="map.id">
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
          <n-flex :wrap="false">
            <n-button
              secondary
              type="primary"
              size="small"
              @click="onDownloadMap(map)"
            >
              <template #icon>
                <BasicIcon icon="download-2-line" />
              </template>
              {{ t("common.action.download") }}
            </n-button>
            <n-button
              secondary
              type="error"
              size="small"
              @click="onRemoveMap(map)"
            >
              <template #icon>
                <BasicIcon icon="delete-2-line" />
              </template>
              {{ t("instances.list.remove.button") }}
            </n-button>
          </n-flex>
        </template>
      </n-list-item>
    </n-spin>
  </list-view-page>
</template>
