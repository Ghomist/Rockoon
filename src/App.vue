<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "./stores/app";
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
  // {
  //   key: "download",
  //   component: DownloadPage
  // },
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
        <!-- <HomePage v-if="app.pageId === 'home'" />
        <InstancesPage v-else-if="app.pageId === 'instances'" />
        <DownloadPage v-else-if="app.pageId === 'download'" />
        <SettingsPage v-else-if="app.pageId === 'settings'" />
        <WikiPage v-else-if="app.pageId == 'wiki'" /> -->
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  justify-items: center;
}

.header {
  height: 54px;
  background-color: var(--color-prime);
}

.content {
  height: calc(100vh - 54px);

  /* background-color: aqua; */
  background-image: var(--background-image);
}
</style>
