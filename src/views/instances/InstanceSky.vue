<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import { useAppStore } from "@/stores/app";
import { openDialog, sendMessage } from "@/utils/message";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import {
  computed,
  h,
  onMounted,
  onUnmounted,
  ref,
  watchEffect,
  WatchHandle
} from "vue";
import fs from "@/api/fs";

const app = useAppStore();
const instance = computed(() => app.selected!);

const skyPath = ref("");
const updateSkyPath = async () => {
  skyPath.value = await join(
    instance.value.path,
    "Textures",
    "Sky",
    "Sky_{sky}_Down.bmp"
  );
};

const onClickSky = (sky: string, level: number) => {
  const skyDown = skyPath.value.replace("{sky}", sky);
  const dirs = ["Left", "Front", "Right", "Back"];
  openDialog(
    () =>
      h("div", {}, [
        h("img", {
          src: convertFileSrc(skyDown),
          width: "128",
          style: "margin-right: var(--d-margin)"
        }),
        ...dirs.map(dir =>
          h("img", {
            src: convertFileSrc(skyDown.replace("Down", dir)),
            width: "128",
            alt: dir
          })
        )
      ]),
    {
      title: `第${level + 1}关 Sky_${sky}`,
      maxWidth: "none",
      sureText: "更换背景",
      onSure: async () => {
        const files = await browseFile({
          filters: [
            { name: "BMP 背景图", extensions: ["bmp"] }
            // { name: "背景包", extensions: ["zip"] }
          ],
          multiple: true
        });
        if (!files || !files.length) return;
        if (files.length === 1 && files[0].endsWith(".zip")) {
          // TODO
          sendMessage("暂不支持 zip 格式的背景包");
          return;
        }
        if (files.length !== 5) {
          sendMessage("请选择五张背景图");
          return;
        }
        const allDirs = ["Down", ...dirs];
        for (const file of files) {
          const dirIndex = allDirs.findIndex(dir =>
            file.match(new RegExp(`Sky_[A-M]_${dir}\\.bmp`, "i"))
          );
          if (dirIndex !== -1) allDirs.splice(dirIndex, 1);
        }
        if (allDirs.length) {
          sendMessage(`缺少背景方向：${allDirs.join(", ")}`);
          return;
        }
        openDialog("是否替换背景？这会覆盖现有的背景，并且无法复原", {
          title: "替换背景",
          onSure: async () => {
            for (const file of files) {
              const match = file.match(/Sky_[A-M]_(\w+)\.bmp/i)!;
              const dir = match[1];
              const skyPath = await join(
                instance.value.path,
                "Textures",
                "Sky",
                `Sky_${sky}_${dir}.bmp`
              );
              await fs.copy(file, skyPath);
            }
            sendMessage("背景已替换");
          }
        });
      }
    }
  );
};

let handle: WatchHandle;
onMounted(async () => {
  handle = watchEffect(updateSkyPath);
});
onUnmounted(() => {
  handle?.stop();
});
</script>

<template>
  <BasicBlock
    style="
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      row-gap: var(--d-margin);
    "
  >
    <div v-for="(sky, level) in 'LEAFCHDGKBJI'" class="sky-container">
      <img
        :src="convertFileSrc(skyPath.replace('{sky}', sky))"
        class="anim"
        width="128"
        style="height: 128px"
        @click="onClickSky(sky, level)"
      />
      <p class="light">{{ `第${level + 1}关 Sky_${sky}` }}</p>
    </div>
  </BasicBlock>
</template>

<style scoped lang="scss">
.sky-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--d-margin-sm);

  img {
    cursor: pointer;
    border-radius: var(--d-round-sm);
    box-shadow: var(--box-shadow);

    will-change: transform;

    &:hover {
      transform: scale(1.05);
      box-shadow: var(--box-shadow-prime);
    }
  }
}
</style>
