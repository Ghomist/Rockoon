<script setup lang="ts">
import ballance from "@/api/ballance";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import SwitchButton from "@/components/SwitchButton.vue";
import { useAppStore } from "@/stores/app";
import { withDefault } from "@/utils/common";
import { join } from "@tauri-apps/api/path";
import { computed, onMounted, ref, watch } from "vue";
import NoneSelectedPage from "./NoneSelectedPage.vue";

const app = useAppStore();
const instance = computed(() => app.selected!);

const playerConfig = ref<NewPlayerConfig>();
const readPlayerIni = async () => {
  if (instance.value.newPlayer) {
    const iniPath = await join(instance.value.path, "Bin", "Player.ini");
    const config = await ballance.readLaunchConfig(iniPath);
    playerConfig.value = withDefault(config, playerConfig.value);
  }
};
const savePlayerIni = async () => {
  if (instance.value.newPlayer && playerConfig.value) {
    console.log("save");
    const iniPath = await join(instance.value.path, "Bin", "Player.ini");
    await ballance.saveLaunchConfig(iniPath, playerConfig.value);
  }
};
onMounted(async () => {
  await readPlayerIni();
  watch(playerConfig, savePlayerIni, { deep: true });
  watch(instance, readPlayerIni);
});
</script>

<template>
  <template v-if="instance.newPlayer && playerConfig">
    <BasicCollapse title="常用启动项" open>
      <BasicConfig
        title="跳过启动动画"
        tooltip="跳过打开游戏时的 Atari 以及 Ballance 动画"
      >
        <BasicSwitch v-model="playerConfig['Game']['SkipOpening']" />
      </BasicConfig>
      <BasicConfig title="去除帧率限制" tooltip="允许高帧率">
        <BasicSwitch v-model="playerConfig['Game']['UnlockFramerate']" />
      </BasicConfig>
      <BasicConfig
        title="允许高分辨率"
        tooltip="允许使用高于 1600x1200 的分辨率"
      >
        <BasicSwitch v-model="playerConfig['Game']['UnlockHighResolution']" />
      </BasicConfig>
      <BasicConfig title="分辨率">
        <BasicInput
          data-type="number"
          v-model="playerConfig['Graphics']['Width']"
          style="text-align: center"
          :style="{
            width:
              playerConfig['Graphics']['Width'].length > 3 ? '40px' : '30px'
          }"
        />
        <p>×</p>
        <BasicInput
          data-type="number"
          v-model="playerConfig['Graphics']['Height']"
          style="text-align: center"
          :style="{
            width:
              playerConfig['Graphics']['Height'].length > 3 ? '40px' : '30px'
          }"
        />
      </BasicConfig>
      <BasicConfig title="全屏">
        <BasicSwitch v-model="playerConfig['Graphics']['Fullscreen']" />
      </BasicConfig>
      <BasicConfig title="无边框模式" tooltip="去除窗口边框">
        <BasicSwitch v-model="playerConfig['Window']['Borderless']" />
      </BasicConfig>
      <BasicConfig title="限制鼠标在窗口内">
        <BasicSwitch v-model="playerConfig['Window']['ClipCursor']" />
      </BasicConfig>
      <BasicConfig
        title="允许后台输入"
        tooltip="窗口在后台时也可以响应鼠标/键盘输入"
      >
        <BasicSwitch v-model="playerConfig['Window']['AlwaysHandleInput']" />
      </BasicConfig>
      <BasicConfig title="失去焦点时暂停" tooltip="切出窗口时游戏自动暂停">
        <BasicSwitch v-model="playerConfig['Window']['PauseOnDeactivated']" />
      </BasicConfig>
    </BasicCollapse>

    <BasicCollapse title="游戏性">
      <BasicConfig title="游戏语言">
        <SwitchButton
          v-for="item in [
            { value: '0', label: 'German' },
            { value: '1', label: 'English' },
            { value: '2', label: 'Spanish' },
            { value: '3', label: 'Italian' },
            { value: '4', label: 'French' }
          ]"
          :active="playerConfig['Game']['Language'] === item.value"
          @click="playerConfig['Game']['Language'] = item.value"
        >
          {{ item.label }}
        </SwitchButton>
      </BasicConfig>
      <BasicConfig
        title="跳过启动动画"
        tooltip="跳过打开游戏时的 Atari 以及 Ballance 动画"
      >
        <BasicSwitch v-model="playerConfig['Game']['SkipOpening']" />
      </BasicConfig>
      <BasicConfig title="应用热修复">
        <BasicSwitch v-model="playerConfig['Game']['ApplyHotfix']" />
      </BasicConfig>
      <BasicConfig title="去除帧率限制" tooltip="允许高帧率">
        <BasicSwitch v-model="playerConfig['Game']['UnlockFramerate']" />
      </BasicConfig>
      <BasicConfig title="去除高宽限制" tooltip="允许使用非 4:3 的分辨率">
        <BasicSwitch v-model="playerConfig['Game']['UnlockWidescreen']" />
      </BasicConfig>
      <BasicConfig
        title="允许高分辨率"
        tooltip="允许使用高于 1600x1200 的分辨率"
      >
        <BasicSwitch v-model="playerConfig['Game']['UnlockHighResolution']" />
      </BasicConfig>
      <BasicConfig title="调试模式">
        <BasicSwitch v-model="playerConfig['Game']['Debug']" />
      </BasicConfig>
      <BasicConfig title="Rookie">
        <BasicSwitch v-model="playerConfig['Game']['Rookie']" />
      </BasicConfig>
    </BasicCollapse>

    <BasicCollapse title="启动项">
      <BasicConfig
        title="覆盖日志"
        tooltip="每次启动会覆盖之前的日志，否则会追加至尾部"
      >
        <BasicSwitch v-model="playerConfig['Startup']['LogMode']" />
      </BasicConfig>
      <BasicConfig title="详细日志">
        <BasicSwitch v-model="playerConfig['Startup']['Verbose']" />
      </BasicConfig>
      <BasicConfig title="手动启动" tooltip="显示启动设定的对话窗口">
        <BasicSwitch v-model="playerConfig['Startup']['ManualSetup']" />
      </BasicConfig>
      <BasicConfig title="加载所有 Manager">
        <BasicSwitch v-model="playerConfig['Startup']['LoadAllManagers']" />
      </BasicConfig>
      <BasicConfig title="加载所有 Building Block">
        <BasicSwitch
          v-model="playerConfig['Startup']['LoadAllBuildingBlocks']"
        />
      </BasicConfig>
      <BasicConfig title="加载所有插件">
        <BasicSwitch v-model="playerConfig['Startup']['LoadAllPlugins']" />
      </BasicConfig>
    </BasicCollapse>

    <BasicCollapse title="图形设置">
      <BasicConfig title="显卡 ID">
        <BasicInput v-model="playerConfig['Graphics']['Driver']" />
      </BasicConfig>
      <BasicConfig title="颜色位深">
        <SwitchButton
          v-for="item in [
            { value: '16', label: '16位色' },
            { value: '32', label: '32位色' }
          ]"
          :active="playerConfig['Graphics']['BitsPerPixel'] === item.value"
          @click="playerConfig['Graphics']['BitsPerPixel'] = item.value"
        >
          {{ item.label }}
        </SwitchButton>
      </BasicConfig>
      <BasicConfig title="分辨率">
        <BasicInput
          data-type="number"
          v-model="playerConfig['Graphics']['Width']"
          style="text-align: center"
          :style="{
            width:
              playerConfig['Graphics']['Width'].length > 3 ? '40px' : '30px'
          }"
        />
        <p>×</p>
        <BasicInput
          data-type="number"
          v-model="playerConfig['Graphics']['Height']"
          style="text-align: center"
          :style="{
            width:
              playerConfig['Graphics']['Height'].length > 3 ? '40px' : '30px'
          }"
        />
      </BasicConfig>
      <BasicConfig title="全屏">
        <BasicSwitch v-model="playerConfig['Graphics']['Fullscreen']" />
      </BasicConfig>
      <BasicConfig title="禁用透视矫正">
        <BasicSwitch
          v-model="playerConfig['Graphics']['DisablePerspectiveCorrection']"
        />
      </BasicConfig>
      <BasicConfig title="强制线性雾效">
        <BasicSwitch v-model="playerConfig['Graphics']['ForceLinearFog']" />
      </BasicConfig>
      <BasicConfig title="强制软件渲染">
        <BasicSwitch v-model="playerConfig['Graphics']['ForceSoftware']" />
      </BasicConfig>
      <BasicConfig title="禁用材质过滤">
        <BasicSwitch v-model="playerConfig['Graphics']['DisableFilter']" />
      </BasicConfig>
      <BasicConfig title="检查顶点着色器">
        <BasicSwitch v-model="playerConfig['Graphics']['EnsureVertexShader']" />
      </BasicConfig>
      <BasicConfig title="启用顶点缓冲">
        <BasicSwitch v-model="playerConfig['Graphics']['UseIndexBuffers']" />
      </BasicConfig>
      <BasicConfig title="禁用图像抖动">
        <BasicSwitch v-model="playerConfig['Graphics']['DisableDithering']" />
      </BasicConfig>
      <BasicConfig title="抗锯齿多重采样数" tooltip="最小值为2">
        <BasicInput
          data-type="number"
          v-model="playerConfig['Graphics']['Antialias']"
        />
      </BasicConfig>
      <BasicConfig title="禁用 Mipmap">
        <BasicSwitch v-model="playerConfig['Graphics']['DisableMipmap']" />
      </BasicConfig>
      <BasicConfig title="禁用镜面高光">
        <BasicSwitch v-model="playerConfig['Graphics']['DisableSpecular']" />
      </BasicConfig>
      <BasicConfig title="启用屏幕转储">
        <BasicSwitch v-model="playerConfig['Graphics']['EnableScreenDump']" />
      </BasicConfig>
      <BasicConfig title="启用调试渲染" tooltip="逐步渲染">
        <BasicSwitch v-model="playerConfig['Graphics']['EnableDebugMode']" />
      </BasicConfig>
      <BasicConfig
        title="顶点缓存"
        tooltip="设置顶点缓存大小，设置为 0 可禁用排序"
      >
        <BasicInput v-model="playerConfig['Graphics']['VertexCache']" />
      </BasicConfig>
      <BasicConfig title="纹理缓存管理">
        <BasicSwitch
          v-model="playerConfig['Graphics']['TextureCacheManagement']"
        />
      </BasicConfig>
      <BasicConfig title="透明物体排序">
        <BasicSwitch
          v-model="playerConfig['Graphics']['SortTransparentObjects']"
        />
      </BasicConfig>
      <BasicConfig title="纹理格式" tooltip="例如 _32_ARGB8888">
        <BasicInput v-model="playerConfig['Graphics']['TextureVideoFormat']" />
      </BasicConfig>
      <BasicConfig title="贴图格式" tooltip="例如 _32_ARGB8888">
        <BasicInput v-model="playerConfig['Graphics']['SpriteVideoFormat']" />
      </BasicConfig>
    </BasicCollapse>

    <BasicCollapse title="窗口设置">
      <BasicConfig title="子窗口渲染">
        <BasicInput v-model="playerConfig['Window']['ChildWindowRendering']" />
      </BasicConfig>
      <BasicConfig title="无边框模式" tooltip="去除窗口边框">
        <BasicSwitch v-model="playerConfig['Window']['Borderless']" />
      </BasicConfig>
      <BasicConfig title="限制鼠标在窗口内">
        <BasicSwitch v-model="playerConfig['Window']['ClipCursor']" />
      </BasicConfig>
      <BasicConfig
        title="允许后台输入"
        tooltip="窗口在后台时也可以响应鼠标/键盘输入"
      >
        <BasicSwitch v-model="playerConfig['Window']['AlwaysHandleInput']" />
      </BasicConfig>
      <BasicConfig title="失去焦点时暂停" tooltip="切出窗口时游戏自动暂停">
        <BasicSwitch v-model="playerConfig['Window']['PauseOnDeactivated']" />
      </BasicConfig>
      <BasicConfig title="窗口位置" tooltip="可以设置负数">
        <BasicInput
          data-type="number"
          v-model="playerConfig['Window']['X']"
          style="text-align: center"
          placeholder="0"
          :style="{
            width: playerConfig['Window']['X']?.length > 3 ? '40px' : '30px'
          }"
        />
        <p>，</p>
        <BasicInput
          data-type="number"
          v-model="playerConfig['Window']['Y']"
          style="text-align: center"
          placeholder="0"
          :style="{
            width: playerConfig['Window']['Y']?.length > 3 ? '40px' : '30px'
          }"
        />
      </BasicConfig>
    </BasicCollapse>
  </template>
  <NoneSelectedPage
    v-else-if="!instance.newPlayer"
    tips="该实例尚未安装新 Player，暂时无法设置启动选项"
  />
  <NoneSelectedPage v-else tips="加载中，请稍后..." />
</template>
