<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicButton from "@/components/BasicButton.vue";
import BasicIcon from "@/components/BasicIcon.vue";
import BasicNavItem from "@/components/BasicNavItem.vue";
import BasicSplit from "@/components/BasicSplit.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { usePrefStore } from "@/stores/pref";
import { openDialog, sendMessage } from "@/utils/message";
import { onMounted, onUnmounted, ref } from "vue";

const app = useAppStore();
const pref = usePrefStore();
const fs = useFileStore();

const hideInstanceList = ref(true);

const onLaunch = async () => {
  if (app.runningInstance) {
    openDialog("要强制关闭正在运行的游戏吗？", {
      onSure: async () => {
        await app.killInstance();
        sendMessage("游戏已关闭");
      }
    });
  } else if (app.selected) {
    // TODO: 手动启动 + 无 Mod 启动
    await app.launchInstance(app.selected);
    pref.recent = app.selected.path;
    sendMessage("游戏已启动！");
  } else {
    sendMessage("还没有添加游戏呢，请先添加游戏实例（选择本地文件或在线下载）");
    app.page = "instances";
  }
};

const checkingIntervalId = ref();
onMounted(() => {
  checkingIntervalId.value = setInterval(() => {
    app.checkRunningInstance();
  }, 1500);
});
onUnmounted(() => {
  clearInterval(checkingIntervalId.value);
});
</script>

<template>
  <div class="homepage-container">
    <BasicBlock
      :style="{
        width: hideInstanceList ? '0px' : '200px',
        minWidth: hideInstanceList ? '0px' : '200px',
        opacity: hideInstanceList ? 0 : 1,
        marginRight: hideInstanceList ? '-10px' : ''
      }"
    >
      <BasicNavItem
        v-if="pref.hasRecent"
        :name="pref.recent!"
        :selected="app.selected?.path === pref.recent!"
        @clicked="app.changeSelect(pref.recent!)"
      >
        <p
          style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        >
          <BasicIcon icon="history-line" style="margin-right: 4px" />
          {{ pref.recentInstance!.name }}
        </p>
      </BasicNavItem>
      <BasicSplit v-if="pref.hasRecent" />
      <BasicNavItem
        v-for="i in fs.instances"
        :name="i.path"
        :selected="app.selected?.path === i.path"
        @clicked="app.changeSelect(i.path)"
      >
        <p
          style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        >
          {{ i.name }}
        </p>
      </BasicNavItem>
      <!-- <BasicNavItem
        name=""
        :selected="false"
        style="border: none; color: var(--color-text-light)"
        @clicked=""
      >
        <BasicIcon icon="add-circle-line" /> 添加
      </BasicNavItem> -->
    </BasicBlock>
    <div style="display: flex; align-items: center">
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;

          /* box-shadow: 0 0 10px var(--color-prime-invert);
          background-color: var(--box-background); */
          color: var(--color-prime);
          cursor: pointer;
          border-radius: 50%;
        "
        @click="hideInstanceList = !hideInstanceList"
      >
        <BasicIcon
          :style="{ transform: hideInstanceList ? 'scaleX(-1)' : '' }"
          width="30px"
          icon="left-line"
        />
      </div>
    </div>

    <div class="launch-container">
      <img
        class="ballance-logo"
        width="128"
        height="128"
        src="/logo.png"
        alt="Ballance-icon"
        :draggable="false"
      />
      <BasicButton
        class="basic-btn"
        style="
          padding: 12px 24px;
          margin-top: 10px;
          margin-bottom: 10px;
          font-size: 20px;
          font-size: 1em;
          transition: all 200ms;
        "
        @click="onLaunch"
      >
        <span v-if="!app.runningInstance">
          {{ app.selectedName ?? "Ballance" }} 启动 !
        </span>
        <template v-else> 强制关闭运行中的游戏 </template>
      </BasicButton>
      <p style="color: var(--color-text-light)">
        最近启动：{{ pref.hasRecent ? pref.recentInstance!.name : "无" }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.ballance-logo {
  position: relative;
  z-index: 1;
  padding: 20px;
  overflow: visible;
  filter: drop-shadow(0 0 18px rgb(0 0 0 / 40%));
  transition: all 200ms;
  transform: translateZ(0);
  will-change: filter;

  &:hover {
    filter: drop-shadow(0 0 18px orange);
  }
}

.homepage-container {
  display: flex;
  width: 100%;
  height: 100%;
}

.launch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 9999px;
  height: 100%;
  margin-right: 40px;
}
</style>
