<script setup lang="ts">
import { computed } from "vue";
import BasicMessage from "./components/BasicMessage.vue";
import { useAppStore } from "./stores/app";
import DownloadPage from "./views/download/DownloadPage.vue";
import Header from "./views/header/Header.vue";
import HelpPage from "./views/help/HelpPage.vue";
import HomePage from "./views/home/HomePage.vue";
import InstancesPage from "./views/instances/InstancesPage.vue";
import SettingsPage from "./views/settings/SettingsPage.vue";
import ToolsPage from "./views/tools/ToolsPage.vue";

const app = useAppStore();
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
</script>

<template>
  <div class="container">
    <div class="header">
      <Header></Header>
    </div>
    <div class="content">
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
        :type="msg.type"
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
  height: 54px;
  background-color: var(--color-prime);

  border-radius: 8px 8px 0 0;
}

.content {
  height: calc(100vh - 54px - 16px);

  /* background-color: aqua; */
  background-image: var(--background-image);

  border-radius: 0 0 8px 8px;
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
