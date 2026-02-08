<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { waitForSelectedInstance } from "@/utils/ui/router";
import NFormWrapper from "@/views/components/NFormWrapper.vue";
import { join } from "@tauri-apps/api/path";
import { NButton, NLayout, NTabPane, NTabs } from "naive-ui";
import { onMounted, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const app = useAppStore();
const launchConfig = ref<BallanceLaunchConfig>();
const launchConfigPath = ref("");

watch(
  launchConfig,
  async () => {
    if (!launchConfig.value) return;
    await backend.saveLaunchConfig(launchConfigPath.value, launchConfig.value);
  },
  { deep: true }
);

const onOpenConfig = async () => {
  await backend.open(launchConfigPath.value);
};

onMounted(async () => {
  await waitForSelectedInstance(async data => {
    launchConfigPath.value = await join(data.path, "Bin", "Player.ini");
    launchConfig.value = await backend.readLaunchConfig(launchConfigPath.value);
  });
});
</script>

<template>
  <n-layout
    style="margin: 14px 28px; height: calc(var(--main-container-h) - 28px)"
  >
    <n-tabs
      v-if="launchConfig"
      type="line"
      animated
      style="height: 100%"
      :pane-style="{ height: '100%' }"
      :pane-wrapper-style="{ height: '100%' }"
    >
      <template #suffix>
        <n-button type="primary" secondary @click="onOpenConfig">
          {{ t("gameConfig.openConfigFile") }}
        </n-button>
      </template>
      <n-tab-pane
        name="InGameOptions"
        :tab="t('gameConfig.tabs.inGameOptions')"
      >
        <NFormWrapper
          :schema="[
            {
              label: t('gameConfig.inGameOptions.volume.label'),
              tip: t('gameConfig.inGameOptions.volume.tip'),
              type: 'slider',
              min: 0,
              max: 1,
              step: 0.01,
              format: (v: number) => (v * 100).toFixed(0) + '%',
              valueRef: toRef(app.selectedInstanceData!.options, 'volume')
            },
            {
              label: t('gameConfig.inGameOptions.syncToScreen.label'),
              type: 'switch',
              valueRef: toRef(app.selectedInstanceData!.options, 'syncToScreen')
            },
            {
              label: t('gameConfig.inGameOptions.cloudLayer.label'),
              type: 'switch',
              valueRef: toRef(app.selectedInstanceData!.options, 'cloudLayer')
            },
            {
              label: t('gameConfig.inGameOptions.invertCamRotation.label'),
              type: 'switch',
              valueRef: toRef(
                app.selectedInstanceData!.options,
                'invertCamRotation'
              )
            },
            ...[
              {
                name: t('gameConfig.inGameOptions.keyForward.label'),
                key: 'keyForward'
              },
              {
                name: t('gameConfig.inGameOptions.keyBackward.label'),
                key: 'keyBackward'
              },
              {
                name: t('gameConfig.inGameOptions.keyLeft.label'),
                key: 'keyLeft'
              },
              {
                name: t('gameConfig.inGameOptions.keyRight.label'),
                key: 'keyRight'
              },
              {
                name: t('gameConfig.inGameOptions.keyLiftCam.label'),
                key: 'keyLiftCam'
              },
              {
                name: t('gameConfig.inGameOptions.keyRotateCam.label'),
                tip: t('gameConfig.inGameOptions.keyRotateCam.tip'),
                key: 'keyRotateCam'
              }
            ].map(x => ({
              label: x.name,
              tip: x.tip,
              type: 'key' as 'key',
              valueRef: toRef(
                app.selectedInstanceData!.options,
                x.key as keyof BallanceOptions
              )
            }))
          ]"
        />
      </n-tab-pane>
      <n-tab-pane name="Game" :tab="t('gameConfig.tabs.game')">
        <NFormWrapper
          :schema="[
            {
              label: t('gameConfig.game.language.label'),
              tip: t('gameConfig.game.language.tip'),
              type: 'select',
              valueRef: toRef(launchConfig.Game, 'Language'),
              options: [
                {
                  value: 0,
                  label: t('gameConfig.game.language.options.German')
                },
                {
                  value: 1,
                  label: t('gameConfig.game.language.options.English')
                },
                {
                  value: 2,
                  label: t('gameConfig.game.language.options.Spanish')
                },
                {
                  value: 3,
                  label: t('gameConfig.game.language.options.Italian')
                },
                {
                  value: 4,
                  label: t('gameConfig.game.language.options.French')
                }
              ]
            },
            {
              label: t('gameConfig.game.skipOpening.label'),
              tip: t('gameConfig.game.skipOpening.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Game, 'SkipOpening')
            },
            {
              label: t('gameConfig.game.unlockFramerate.label'),
              tip: t('gameConfig.game.unlockFramerate.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Game, 'UnlockFramerate')
            },
            {
              label: t('gameConfig.game.unlockWidescreen.label'),
              tip: t('gameConfig.game.unlockWidescreen.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Game, 'UnlockWidescreen')
            },
            {
              label: t('gameConfig.game.unlockHighResolution.label'),
              tip: t('gameConfig.game.unlockHighResolution.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Game, 'UnlockHighResolution')
            },
            {
              label: t('gameConfig.game.applyHotfix.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Game, 'ApplyHotfix')
            }
          ]"
        />
      </n-tab-pane>
      <n-tab-pane name="Window" :tab="t('gameConfig.tabs.window')">
        <NFormWrapper
          :schema="[
            {
              label: t('gameConfig.window.clipCursor.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Window, 'ClipCursor')
            },
            {
              label: t('gameConfig.window.borderless.label'),
              tip: t('gameConfig.window.borderless.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Window, 'Borderless')
            },
            {
              label: t('gameConfig.window.childWindowRendering.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Window, 'ChildWindowRendering')
            },
            {
              label: t('gameConfig.window.alwaysHandleInput.label'),
              tip: t('gameConfig.window.alwaysHandleInput.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Window, 'AlwaysHandleInput')
            },
            {
              label: t('gameConfig.window.position.label'),
              tip: t('gameConfig.window.position.tip'),
              type: 'number-pair',
              valueRef: toRef(launchConfig.Window, 'X'),
              valueRef2: toRef(launchConfig.Window, 'Y')
            }
          ]"
        />
      </n-tab-pane>
      <n-tab-pane name="Graphics" :tab="t('gameConfig.tabs.graphics')">
        <NFormWrapper
          :schema="[
            {
              label: t('gameConfig.graphics.resolution.label'),
              type: 'number-pair',
              valueRef: toRef(launchConfig.Graphics, 'Width'),
              valueRef2: toRef(launchConfig.Graphics, 'Height')
            },
            {
              label: t('gameConfig.graphics.driver.label'),
              type: 'number',
              valueRef: toRef(launchConfig.Graphics, 'Driver')
            },
            {
              label: t('gameConfig.graphics.disableDithering.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'DisableDithering')
            },
            {
              label: t('gameConfig.graphics.disableSpecular.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'DisableSpecular')
            },
            {
              label: t('gameConfig.graphics.disableMipmap.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'DisableMipmap')
            },
            {
              label: t(
                'gameConfig.graphics.disablePerspectiveCorrection.label'
              ),
              type: 'switch',
              valueRef: toRef(
                launchConfig.Graphics,
                'DisablePerspectiveCorrection'
              )
            },
            {
              label: t('gameConfig.graphics.forceLinearFog.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'ForceLinearFog')
            },
            {
              label: t('gameConfig.graphics.forceSoftware.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'ForceSoftware')
            },
            {
              label: t('gameConfig.graphics.disableFilter.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'DisableFilter')
            },
            {
              label: t('gameConfig.graphics.ensureVertexShader.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'EnsureVertexShader')
            },
            {
              label: t('gameConfig.graphics.useIndexBuffers.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'UseIndexBuffers')
            },
            {
              label: t('gameConfig.graphics.sortTransparentObjects.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'SortTransparentObjects')
            },
            {
              label: t('gameConfig.graphics.textureCacheManagement.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'TextureCacheManagement')
            },
            {
              label: t('gameConfig.graphics.enableDebugMode.label'),
              tip: t('gameConfig.graphics.enableDebugMode.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'EnableDebugMode')
            },
            {
              label: t('gameConfig.graphics.enableScreenDump.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Graphics, 'EnableScreenDump')
            },
            {
              label: t('gameConfig.graphics.antialias.label'),
              tip: t('gameConfig.graphics.antialias.tip'),
              type: 'number',
              valueRef: toRef(launchConfig.Graphics, 'Antialias')
            },
            {
              label: t('gameConfig.graphics.vertexCache.label'),
              tip: t('gameConfig.graphics.vertexCache.tip'),
              type: 'number',
              valueRef: toRef(launchConfig.Graphics, 'VertexCache')
            },
            {
              label: t('gameConfig.graphics.bitsPerPixel.label'),
              tip: t('gameConfig.graphics.bitsPerPixel.tip'),
              type: 'number',
              valueRef: toRef(launchConfig.Graphics, 'BitsPerPixel')
            },
            {
              label: t('gameConfig.graphics.spriteVideoFormat.label'),
              type: 'input',
              valueRef: toRef(launchConfig.Graphics, 'SpriteVideoFormat')
            },
            {
              label: t('gameConfig.graphics.textureVideoFormat.label'),
              type: 'input',
              valueRef: toRef(launchConfig.Graphics, 'TextureVideoFormat')
            }
          ]"
        />
      </n-tab-pane>
      <n-tab-pane name="Startup" :tab="t('gameConfig.tabs.startup')">
        <NFormWrapper
          :schema="[
            {
              label: t('gameConfig.startup.logMode.label'),
              tip: t('gameConfig.startup.logMode.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'LogMode')
            },
            {
              label: t('gameConfig.startup.verbose.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'Verbose')
            },
            {
              label: t('gameConfig.startup.manualSetup.label'),
              tip: t('gameConfig.startup.manualSetup.tip'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'ManualSetup')
            },
            {
              label: t('gameConfig.startup.loadAllManagers.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'LoadAllManagers')
            },
            {
              label: t('gameConfig.startup.loadAllBuildingBlocks.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'LoadAllBuildingBlocks')
            },
            {
              label: t('gameConfig.startup.loadAllPlugins.label'),
              type: 'switch',
              valueRef: toRef(launchConfig.Startup, 'LoadAllPlugins')
            }
          ]"
        />
      </n-tab-pane>
    </n-tabs>
  </n-layout>
</template>
