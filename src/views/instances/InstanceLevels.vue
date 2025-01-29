<script setup lang="ts">
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { pad } from "@/utils/format";
import { computed, toRef } from "vue";

const app = useAppStore();
const pref = usePrefStore();
const instance = computed(() => app.selected!);

const unlockAllLevels = () => {
  instance.value.options.levelLock.fill(true);
};

const resetLevelLock = () => {
  instance.value.options.levelLock[0] = true;
  instance.value.options.levelLock.fill(false, 1);
};

const resetHighscores = () => {
  const getHighestScoreOfLevel = (level: number) => (level < 12 ? 4000 : 7000);
  const ranking = toRef(instance.value.options.highscores);
  for (let i = 0; i < ranking.value.length; ++i) {
    for (let j = 0; j < ranking.value[i].length; ++j) {
      ranking.value[i][j].player = pref.highscoreDefaultPlayer;
      ranking.value[i][j].score = getHighestScoreOfLevel(i + 1) - j * 400;
    }
  }
};
</script>

<template>
  <BasicCollapse title="关卡与高分榜设置" open>
    <BasicConfig title="解锁全部关卡">
      <BasicButton @click="unlockAllLevels">解锁</BasicButton>
    </BasicConfig>
    <BasicConfig title="锁定为初始状态" tooltip="锁定 1~11 关">
      <BasicButton @click="resetLevelLock">锁定</BasicButton>
    </BasicConfig>
    <BasicConfig
      title="重置高分榜"
      tooltip="这会清空高分榜中所有已记录的玩家与分数！"
    >
      <BasicButton @click="resetHighscores">重置</BasicButton>
    </BasicConfig>
    <BasicConfig title="最近玩家名称" tooltip="通关打破高分纪录后默认玩家署名">
      <BasicInput
        style="width: min-content"
        v-model="instance.options.lastPlayer"
        ascii-only
      />
    </BasicConfig>
  </BasicCollapse>
  <BasicCollapse
    v-for="level in 12"
    :title="'Level_' + pad(level, '0', 2)"
    :summary="instance.options.levelLock[level - 1] ? '已解锁' : '未解锁'"
  >
    <BasicConfig :title="`关卡解锁`">
      <BasicSwitch v-model="instance.options.levelLock[level - 1]" />
    </BasicConfig>
    <BasicConfig v-for="rank in 10" :title="`高分榜 No.${rank}`">
      <BasicInput
        style="width: 100px; text-align: right"
        v-model="instance.options.highscores[level - 1][rank - 1].player"
        ascii-only
      />
      <BasicInput
        data-type="number"
        style="width: 50px; text-align: right"
        v-model="instance.options.highscores[level - 1][rank - 1].score"
      />
    </BasicConfig>
  </BasicCollapse>
</template>
