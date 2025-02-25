<script setup lang="ts">
import { getVersion } from "@tauri-apps/api/app";
import { computed, onMounted } from "vue";
import BasicMessage from "./components/BasicMessage.vue";
import { useAppStore } from "./stores/app";
import { usePrefStore } from "./stores/pref";
import { sendMessage } from "./utils/message";
import DownloadPage from "./views/download/DownloadPage.vue";
import Header from "./views/header/Header.vue";
import HelpPage from "./views/help/HelpPage.vue";
import HomePage from "./views/home/HomePage.vue";
import InstancesPage from "./views/instances/InstancesPage.vue";
import SettingsPage from "./views/settings/SettingsPage.vue";
import ToolsPage from "./views/tools/ToolsPage.vue";

const app = useAppStore();
const pref = usePrefStore();
const pageSchema = [
  {
    key: "home",
    component: HomePage
  },
  {
    key: "instances",
    component: InstancesPage
  },
  {
    key: "download",
    component: DownloadPage
  },
  {
    key: "tools",
    component: ToolsPage
  },
  {
    key: "settings",
    component: SettingsPage
  },
  {
    key: "help",
    component: HelpPage
  }
];
const currentPage = computed(
  () => pageSchema.find(x => x.key === app.page)!.component
);

onMounted(async () => {
  const ver = await getVersion();
  sendMessage(`欢迎使用 Rockoon！当前版本 <b>${ver}</b>`);
});
</script>

<template>
  <div class="container">
    <div class="header" :class="{ onMaximized: pref.isMaximized }">
      <Header></Header>
    </div>
    <div
      id="content-container"
      class="content"
      :class="{ onMaximized: pref.isMaximized }"
      :style="{
        '--bg-blur': pref.backgroundBlur + 'px',
        '--custom-background-image': pref.backgroundImage,
        '--mask-opacity':
          pref.enableBgv || pref.backgroundImage ? pref.maskOpacity : 1
      }"
    >
      <div v-if="pref.backgroundImage" class="content-custom-bg" />
      <video v-else-if="pref.enableBgv" class="content-bgv" autoplay loop muted>
        <source src="/menu_level_compressed.mp4" type="video/mp4" />
      </video>
      <div class="content-bg-blur" />
      <div class="content-bg-mask" />
      <Transition name="fade" mode="out-in">
        <KeepAlive>
          <component :is="currentPage" />
        </KeepAlive>
      </Transition>
    </div>
  </div>

  <div id="message-service">
    <TransitionGroup name="message">
      <BasicMessage
        v-for="msg in app.messageQueue"
        :key="msg.id"
        :message="msg.message"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  justify-items: center;

  transition: none;
}

.header {
  overflow: hidden;

  height: 54px;
  border-radius: 8px 8px 0 0;

  background-color: var(--color-prime);

  &.onMaximized {
    border-radius: 0;
  }
}

.content {
  position: relative;
  overflow: hidden;

  height: calc(100vh - 54px - 16px);
  border-radius: 0 0 8px 8px;

  & > * {
    position: absolute;
  }

  &.onMaximized {
    height: calc(100vh - 54px);
    border-radius: 0;
  }
}
.content-bg-blur {
  inset: 0;
  backdrop-filter: blur(var(--bg-blur));
}
.content-bg-mask {
  inset: 0;
  opacity: var(--mask-opacity);
  background-image: var(--background-image);
}
.content-custom-bg {
  inset: 0;
  background-image: var(--custom-background-image);
  background-size: cover;
  background-position: center center;
}
.content-bgv {
  position: absolute;
  inset: 0;
  min-width: 100%;
  min-height: 100%;
  z-index: -1;
  object-fit: cover;
  overflow: clip;
}

#message-service {
  position: fixed;
  display: flex;
  flex-direction: column;
  justify-content: right;
  pointer-events: none;
  gap: 6px;
  right: 0;
  bottom: 0;
  padding: 20px;
  z-index: 1000;
  width: 260px;
}
</style>
