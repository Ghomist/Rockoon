<script setup lang="ts">
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import SwitchButton from "@/components/SwitchButton.vue";
import { usePrefStore } from "@/stores/pref";
import { openDialog, sendMessage } from "@/utils/dialog";
import storage from "@/utils/storage";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";
import { onMounted, ref } from "vue";

const pref = usePrefStore();

const themeColors: {
  label: string;
  theme: ThemeId;
  alias?: string;
}[] = [
  {
    label: "天空蓝",
    theme: "blue",
    alias: "default"
  },
  {
    label: "晚霞红",
    theme: "red"
  },
  {
    label: "青草绿",
    theme: "green"
  },
  {
    label: "蜜桃粉",
    theme: "pink"
  },
  {
    label: "默哀灰",
    theme: "gray"
  }
];
const onClickTheme = (theme: ThemeId) => {
  pref.theme = theme;
};

const appVersion = ref("");
const tauriVersion = ref("");

// debug
const debugContent = ref("Test Content");
const openDebugDialog = () => {
  openDialog(debugContent.value, "info");
};
const onSendMessage = () => {
  sendMessage("info", debugContent.value);
};

const openDevtools = () => {
  // TODO
};

const clearStorage = () => {
  storage.clear();
  location.reload();
};

onMounted(() => {
  getVersion().then(ver => (appVersion.value = ver));
  getTauriVersion().then(ver => (tauriVersion.value = ver));
});
</script>

<template>
  <div style="display: flex; height: 100%; width: 100%">
    <div class="settings-container">
      <BasicCollapse title="启动器首选项" open>
        <BasicConfig title="启动游戏时隐藏启动器">
          <BasicSwitch v-model="pref.hideWinWhenLaunch" />
        </BasicConfig>
        <BasicConfig title="退出启动器时强制关闭 Ballance" tooltip="开发中...">
          <BasicSwitch v-model="pref.killInstanceWhenExit" />
        </BasicConfig>
        <BasicConfig
          title="默认玩家名称"
          tooltip="重置高分榜时使用的默认玩家名称"
        >
          <BasicInput
            style="width: min-content"
            v-model="pref.highscoreDefaultPlayer"
            ascii-only
          />
        </BasicConfig>
        <BasicConfig title="颜色主题">
          <SwitchButton
            v-for="color in themeColors"
            :active="pref.theme === color.theme || pref.theme === color.alias"
            @click="onClickTheme(color.theme)"
          >
            {{ color.label }}
          </SwitchButton>
        </BasicConfig>
      </BasicCollapse>

      <BasicCollapse title="关于 Rockoon">
        <BasicConfig title="当前版本"> {{ appVersion }} </BasicConfig>
        <BasicConfig title="Tauri 版本"> {{ tauriVersion }} </BasicConfig>
        <BasicConfig title="作者 Github">
          <a @click="open('https://github.com/Ghomist')"> @Ghomist </a>
        </BasicConfig>
        <BasicConfig
          title="开源仓库地址"
          tooltip="欢迎 pr, issue, star！（但是还没开源其实）"
        >
          <a @click="open('https://github.com/Ghomist/Rockoon')">
            https://github.com/Ghomist/Rockoon
          </a>
        </BasicConfig>
      </BasicCollapse>

      <BasicCollapse title="相关站点">
        <BasicConfig title="地图 / Mod 下载源">
          <a @click="open('http://ballancemaps.ysepan.com/')">
            Ballance 地图下载站
          </a>
        </BasicConfig>
        <BasicConfig title="BML 代码仓库">
          <a @click="open('https://github.com/Gamepiaynmo/BallanceModLoader')">
            https://github.com/Gamepiaynmo/BallanceModLoader
          </a>
        </BasicConfig>
        <BasicConfig title="BML+ 代码仓库">
          <a @click="open('https://github.com/doyaGu/BallanceModLoaderPlus')">
            https://github.com/doyaGu/BallanceModLoaderPlus
          </a>
        </BasicConfig>
        <BasicConfig title="New Player 代码仓库">
          <a @click="open('https://github.com/doyaGu/BallancePlayer')">
            https://github.com/doyaGu/BallancePlayer
          </a>
        </BasicConfig>
      </BasicCollapse>

      <BasicCollapse title="开发调试">
        <BasicConfig title="开发者工具">
          <BasicButton @click="openDevtools()"> 打开 </BasicButton>
        </BasicConfig>
        <BasicConfig title="消息测试">
          <BasicButton @click="onSendMessage"> 发送 </BasicButton>
        </BasicConfig>
        <BasicConfig title="弹窗&消息测试内容">
          <BasicInput v-model="debugContent" />
        </BasicConfig>
        <BasicConfig title="弹窗测试">
          <BasicButton @click="openDebugDialog"> 打开 </BasicButton>
        </BasicConfig>
        <BasicConfig title="清空设置" tooltip="这也会清空所有已添加的实例">
          <BasicButton @click="clearStorage()"> 清空 </BasicButton>
        </BasicConfig>
      </BasicCollapse>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  min-height: 100%;
  width: 100%;
  overflow-y: scroll;
}
</style>
