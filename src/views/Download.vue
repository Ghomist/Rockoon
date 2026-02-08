<script setup lang="ts">
import { useDownloadService } from "@/services/download";
import { loadingBar, message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
import { NButton, NFlex, NList, NListItem, NTag, NVirtualList } from "naive-ui";
import { onMounted, ref } from "vue";

const { t } = useI18n();
const download = useDownloadService();

const loading = ref(true);

const data = ref<BallanceMapsResponse>();

onMounted(async () => {
  loadingBar.start();
  try {
    data.value = await download.getMapIndexes();
    loading.value = false;
    loadingBar.finish();
  } catch {
    loadingBar.error();
    message.error(t("common.message.error"));
  }
});
</script>

<template>
  <n-list class="list-header-fix" hoverable clickable style="width: 100%">
    <template #header>
      <n-flex justify="space-between" align="center">
        <p>123123</p>
        <n-flex>
          <n-button>
            {{ t("instances.scan.button") }}
          </n-button>
          <n-button>
            {{ t("instances.add.button") }}
          </n-button>
        </n-flex>
      </n-flex>
    </template>

    <n-virtual-list
      class="list-container-fix"
      :items="data?.maps ?? []"
      :item-size="42"
    >
      <template #default="{ item }">
        <n-list-item>
          <n-flex>
            {{ item.name.replace(/\..+$/g, "") }}
            <n-tag v-if="item.author" type="primary"> {{ item.author }} </n-tag>
            <template v-if="item.tags.length">
              <n-tag v-for="tag in item.tags" :key="tag">
                {{ tag }}
              </n-tag>
            </template>
          </n-flex>

          <template #suffix>
            <n-flex :wrap="false">
              <n-button secondary type="primary">
                {{ t("common.action.openFolder") }}
              </n-button>
              <n-button secondary type="error">
                {{ t("instances.list.remove.button") }}
              </n-button>
            </n-flex>
          </template>
        </n-list-item>
      </template>
    </n-virtual-list>
  </n-list>
</template>
