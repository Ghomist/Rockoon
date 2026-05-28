<script setup lang="ts">
import backend from "@/backend";
import { instanceBackend } from "@/backend/instance";
import { useAppStore } from "@/stores/app";
import { useInstancesStore } from "@/stores/instances";
import { dialog, loadingBar, message } from "@/utils/ui/feedback";
import { sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { formatPlaytime } from "@/utils/format";
import { h, ref } from "vue";
import {
  NButton,
  NCheckbox,
  NFlex,
  NInput,
  NListItem,
  NText,
  NTag
} from "naive-ui";
import { useI18n } from "vue-i18n";
import ListViewPage from "./components/ListViewPage.vue";

const instances = useInstancesStore();
const app = useAppStore();
const { t } = useI18n();

const onScanInstances = async () => {
  loadingBar.start();
  const loadingMessage = message.loading(t("instances.scan.scanning"), {
    duration: 30 * 1000 // show 30s max
  });

  const instanceList = await instanceBackend.scanPossibleInstances();
  let added = 0;
  for (const x of instanceList) {
    const result = await instances.addInstance(
      x.path,
      x.path.split(sep()).pop()!
    );
    if (result) added++;
  }

  loadingMessage.destroy();
  message.success(
    t("instances.scan.success", { total: instanceList.length, added }),
    {
      keepAliveOnHover: true
    }
  );
  loadingBar.finish();
};

const onAddInstance = async () => {
  const folder = await browseFile({
    directory: true,
    title: t("instances.add.browse.title")
  });
  if (folder) {
    const data = await instances.addInstance(folder);
    if (data) {
      app.selectedInstanceData = data;
      message.success(t("instances.add.browse.success"));
    } else {
      message.error(t("instances.add.browse.fail"));
    }
  }
};

const onRemoveInstance = async (i: Instance) => {
  dialog.warning({
    title: t("common.message.warning"),
    content: t("instances.list.remove.message"),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      instances.removeInstance(i.path);
      message.success(t("instances.list.remove.success"));
    }
  });
};

const onOpenFolder = async (i: Instance) => {
  await backend.openInExplorer(i.path);
};

const onRenameInstance = (i: Instance) => {
  const inputValue = ref(i.name);

  dialog.create({
    title: t("instances.list.rename.title"),
    content: () =>
      h(NInput, {
        value: inputValue.value,
        placeholder: t("instances.list.rename.placeholder"),
        onUpdateValue: (v: string) => {
          inputValue.value = v;
        }
      }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      const newName = inputValue.value.trim();
      if (newName && newName !== i.name) {
        instances.renameInstance(i.path, newName);
        message.success(t("instances.list.rename.success"));
      }
    }
  });
};

const onInstanceClick = async (i: Instance) => {
  const success = await app.changeSelect(i.path);
  if (success) {
    const instance = instances.findInstance(i.path);
    message.success(
      t("instances.list.switch.success", { name: instance?.name || i.path })
    );
  }
};
</script>

<template>
  <list-view-page>
    <template #title>
      {{
        t(
          "instances.list.statistics",
          { cnt: instances.instances.length },
          instances.instances.length
        )
      }}
    </template>

    <template #actions>
      <n-button @click="onScanInstances">
        {{ t("instances.scan.button") }}
      </n-button>
      <n-button @click="onAddInstance">
        {{ t("instances.add.button") }}
      </n-button>
    </template>

    <n-list-item
      v-for="i in instances.instances"
      :key="i.path"
      @click="onInstanceClick(i)"
    >
      <template #prefix>
        <n-checkbox :checked="app.selectedInstanceData?.path === i.path" />
      </template>

      <n-flex vertical :size="0">
        <n-text>{{ i.name }}</n-text>
        <n-text depth="3" style="font-size: 12px">{{ i.path }}</n-text>
      </n-flex>

      <template #suffix>
        <n-flex :wrap="false" align="center">
          <n-tag size="small" :bordered="false">{{
            formatPlaytime(i.playtime)
          }}</n-tag>
          <n-button secondary type="primary" @click.stop="onRenameInstance(i)">
            {{ t("instances.list.rename.button") }}
          </n-button>
          <n-button secondary type="primary" @click.stop="onOpenFolder(i)">
            {{ t("common.action.openFolder") }}
          </n-button>
          <n-button secondary type="error" @click.stop="onRemoveInstance(i)">
            {{ t("instances.list.remove.button") }}
          </n-button>
        </n-flex>
      </template>
    </n-list-item>
  </list-view-page>
</template>
