<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { waitForSelectedInstance } from "@/utils/ui/router";
import {
  NButton,
  NDataTable,
  NFlex,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NModal,
  NScrollbar,
  NSwitch,
  NText
} from "naive-ui";
import { h, onMounted, ref } from "vue";

const app = useAppStore();

const headerChildrenRef = ref<HTMLDivElement>();
const editingLevel = ref(0);
const editingHighscores = ref(false);

const onUnlockAll = () => {
  app.selectedInstanceData!.options.levelLock.fill(true);
};
const onToggleLevelLock = (level: number) => {
  app.selectedInstanceData!.options.levelLock[level - 1] =
    !app.selectedInstanceData!.options.levelLock[level - 1];
};

const onEditHighscores = (level: number) => {
  editingLevel.value = level;
  editingHighscores.value = true;
};

onMounted(async () => {
  await waitForSelectedInstance();
});
</script>

<template>
  <n-list
    v-if="app.selectedInstanceData"
    class="list-header-fix"
    hoverable
    clickable
    style="width: 100%"
  >
    <template #header>
      <div ref="headerChildrenRef" />
      <n-flex justify="space-between" align="center">
        <p>
          {{ $t("gameData.title") }}
        </p>
        <n-flex>
          <n-button @click="onUnlockAll">
            {{ $t("gameData.action.unlockAll") }}
          </n-button>
          <n-button>
            {{ $t("gameData.action.exportHighscores") }}
          </n-button>
        </n-flex>
      </n-flex>
    </template>
    <n-scrollbar class="list-container-fix">
      <n-list-item
        v-for="i in 12"
        class="list-item-fix"
        :key="i"
        @click="onToggleLevelLock(i)"
      >
        <template #prefix>
          <n-switch
            v-model:value="app.selectedInstanceData!.options.levelLock[i - 1]"
            @click.stop
          >
            <template #checked>
              {{ $t("gameData.levelState.unlocked") }}
            </template>
            <template #unchecked>
              {{ $t("gameData.levelState.locked") }}
            </template>
          </n-switch>
        </template>
        <n-text style="text-wrap: nowrap">
          {{ $t("gameData.levelLabel", { i }) }}
          <n-text depth="3" code style="margin-left: 8px">
            {{ app.selectedInstanceData!.options.highscores[i - 1][0].player }}
            {{ app.selectedInstanceData!.options.highscores[i - 1][0].score }}
          </n-text>
        </n-text>
        <template #suffix>
          <n-flex :wrap="false" align="center">
            <n-button
              secondary
              type="primary"
              @click.stop="onEditHighscores(i)"
            >
              {{ $t("gameData.action.editHighscores") }}
            </n-button>
          </n-flex>
        </template>
      </n-list-item>
    </n-scrollbar>
    <n-modal
      v-model:show="editingHighscores"
      style="width: 50%"
      preset="card"
      :title="
        $t('gameData.action.editHighscores') +
        ' - ' +
        $t('gameData.levelLabel', { i: editingLevel })
      "
    >
      <n-data-table
        :data="app.selectedInstanceData!.options.highscores[editingLevel - 1]"
        :columns="[
          {
            title: $t('gameData.highscores.rank'),
            key: 'rank',
            width: 80,
            align: 'center',
            render: (_, index) => index + 1
          },
          {
            title: $t('gameData.highscores.player'),
            key: 'player',
            render: row =>
              h(NInput, {
                size: 'small',
                value: row.player,
                'onUpdate:value': v => (row.player = v)
              })
          },
          {
            title: $t('gameData.highscores.score'),
            key: 'score',
            render: row =>
              h(NInputNumber, {
                size: 'small',
                value: row.score,
                'onUpdate:value': v => (row.score = v)
              })
          }
        ]"
      />
    </n-modal>
  </n-list>
</template>
