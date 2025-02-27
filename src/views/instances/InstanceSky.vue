<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import { useAppStore } from "@/stores/app";
import { openDialog, sendMessage } from "@/utils/message";
import { convertFileSrc } from "@tauri-apps/api/core";
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
            width: "128"
          })
        )
      ]),
    {
      title: `第${level + 1}关 Sky_${sky}`,
      maxWidth: "none",
      sureText: "更换背景",
      onSure: () => {
        sendMessage("暂不支持，敬请期待");
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
