<script setup lang="ts">
import fs from "@/api/fs";
import BasicButton from "@/components/BasicButton.vue";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import { useAppStore } from "@/stores/app";
import { useFileStore } from "@/stores/fs";
import { formatFileSize, toPercentage } from "@/utils/format";
import { openDialog, sendMessage } from "@/utils/message";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { download } from "@tauri-apps/plugin-upload";
import { computed, h, reactive, ref } from "vue";

const app = useAppStore();
const fileStore = useFileStore();

type ResourceType =
  | "Ballance.zip"
  | "BML.zip"
  | "BMLPlus.zip"
  | "NewPlayer.zip";

const installInfo = reactive({
  name: "Ballance",
  path: "",
  newPlayer: true,
  bml: false,
  bmlp: true,
  basicMods: false,
  extraMods: false
});
const computedPath = computed(() =>
  installInfo.path
    ? installInfo.path +
      (installInfo.path.endsWith(sep()) ? "" : "" + sep()) +
      installInfo.name
    : ""
);

const onBrowsePath = async () => {
  const selectedPath = await browseFile({ directory: true });
  if (selectedPath) {
    installInfo.path = selectedPath;
  }
};
const onToggleBML = (enable: any) => {
  if (enable && installInfo.bmlp) {
    installInfo.bmlp = false;
    sendMessage("BML 与 BMLPlus 冲突");
  }
};
const onToggleBMLPlus = (enable: any) => {
  if (enable && installInfo.bml) {
    installInfo.bml = false;
    sendMessage("BML 与 BMLPlus 冲突");
  }
};
const onToggleNewPlayer = (enable: any) => {
  if (!enable) {
    installInfo.newPlayer = true;
    sendMessage("目前必须安装新 Player 保证游戏运行");
  }
};

const onInstall = async () => {
  if (!installInfo.name) {
    openDialog("游戏名称不能为空", { title: "下载游戏" });
    return;
  }
  if (!installInfo.path) {
    openDialog("还没选择安装路径哦", { title: "下载游戏" });
    return;
  }
  // if (await fs.exists(computedPath.value)) {
  //   openDialog("该路径已存在，请重新选择", { title: "下载游戏" });
  //   return;
  // }
  let tip = "<b>安装清单：</b><br>+ 原版 Ballance<br>";
  if (installInfo.newPlayer) tip += "+ 新 Player<br>";
  if (installInfo.bml) tip += "+ BML<br>";
  if (installInfo.bmlp) tip += "+ BMLPlus<br>";
  tip += "<b>安装路径：</b><br>" + computedPath.value;
  openDialog(tip, {
    title: "下载游戏",
    onSure: async () => {
      const message = ref("");
      const cancel = ref(false);
      const dialog = openDialog(() => h("p", message.value), {
        title: "下载游戏中...",
        lock: true,
        sure: false,
        cancelText: "取消下载",
        parent: "content",
        onCancel: () => (cancel.value = true)
      });
      message.value = "正在准备下载...";
      const downloadResource = async (name: ResourceType) => {
        const zipPath = await join(computedPath.value, name);
        message.value = `正在下载 ${name}...`;
        await download(
          `https://gitee.com/ghomist/rockoon-resources/releases/download/v1.0.0/${name}`,
          zipPath,
          ({ progressTotal, total, transferSpeed }) => {
            message.value = `正在下载 ${name}... ${toPercentage(progressTotal / total)} (${formatFileSize(transferSpeed)}/秒)`;
            if (cancel.value) throw new Error("取消下载");
          }
        );
        message.value = `正在解压 ${name}...`;
        await fs.unzip(zipPath, computedPath.value);
        if (cancel.value) throw new Error("取消下载");
        message.value = `正在清理...`;
        await fs.delete(zipPath);
      };

      try {
        await fs.mkdir(computedPath.value);
        await downloadResource("Ballance.zip");
        if (installInfo.newPlayer) await downloadResource("NewPlayer.zip");
        if (installInfo.bmlp) await downloadResource("BMLPlus.zip");
        if (installInfo.bml) await downloadResource("BML.zip");
      } catch (e) {
        dialog.close();
        if ((e as Error)?.message === "取消下载") {
          openDialog("下载已取消", { title: "提示" });
        } else {
          openDialog("安装失败，请稍后再试！" + e, { title: "出错啦！" });
        }
        return;
      }

      const newInstance = await fileStore.addInstance(
        computedPath.value,
        installInfo.name
      );
      dialog.close();
      if (newInstance) {
        app.changeSelect(newInstance.path);
        app.page = "instances";
        sendMessage("安装完成！");
      }
    }
  });
};
</script>

<template>
  <div>
    <BasicCollapse title="下载游戏" open>
      <BasicConfig
        title="游戏名称"
        tooltip="用于下载游戏后该游戏在启动器中显示的名称"
      >
        <BasicInput v-model="installInfo.name" />
      </BasicConfig>
      <BasicConfig
        title="安装路径"
        tooltip="游戏文件保存的位置（会自动创建文件夹）"
      >
        <BasicButton @click="onBrowsePath">
          {{ computedPath || "选择路径" }}
        </BasicButton>
      </BasicConfig>
    </BasicCollapse>
    <BasicCollapse title="附加安装项" open>
      <BasicConfig
        title="新 Player"
        tooltip="全新 Player，功能丰富，超强兼容性（必需项）"
      >
        <BasicSwitch
          v-model="installInfo.newPlayer"
          @toggled="onToggleNewPlayer"
        />
      </BasicConfig>
      <BasicConfig title="BMLPlus" tooltip="新版 Mod 导入器（推荐）">
        <BasicSwitch v-model="installInfo.bmlp" @toggled="onToggleBMLPlus" />
      </BasicConfig>
      <BasicConfig title="BML" tooltip="旧版 Mod 导入器">
        <BasicSwitch v-model="installInfo.bml" @toggled="onToggleBML" />
      </BasicConfig>
      <!-- <BasicConfig title="基础 Mod 包" tooltip="一些常用的预装 Mod">
        <BasicSwitch v-model="installInfo.basicMods" />
      </BasicConfig>
      <BasicConfig title="额外 Mod 包" tooltip="一些额外 Mod">
        <BasicSwitch v-model="installInfo.extraMods" />
      </BasicConfig> -->
    </BasicCollapse>
    <BasicConfig title="" style="margin-right: var(--d-margin)">
      <BasicButton @click="onInstall">立即安装</BasicButton>
    </BasicConfig>
  </div>
</template>
