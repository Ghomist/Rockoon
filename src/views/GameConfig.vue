<script setup lang="ts">
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { waitForSelectedInstance } from "@/utils/ui/router";
import { dialog } from "@/utils/ui/feedback";
import NFormWrapper from "@/views/components/NFormWrapper.vue";
import FormSection from "@/views/components/FormSection.vue";
import SettingsNav from "@/views/components/SettingsNav.vue";
import { getKeyName } from "@/views/components/key";
import VirtualKeyboard from "@/views/components/VirtualKeyboard.vue";
import { join } from "@tauri-apps/api/path";
import { h, onMounted, onUnmounted, ref, toRef, watch, type Ref, computed, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Monitor,
  Volume2,
  Gamepad2,
  BookOpen,
  Wrench,
  Image as ImageIcon,
  TriangleAlert,
  Bug,
  FileText
} from "@lucide/vue";

const { t } = useI18n();

const app = useAppStore();
const launchConfig = ref<BallanceLaunchConfig>();
const launchConfigPath = ref("");

watch(
  launchConfig,
  async cfg => {
    if (!cfg) return;
    await backend.saveLaunchConfig(launchConfigPath.value, cfg);
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

// --- Scroll-spy between left nav and right sections ---
const scrollRoot = ref<HTMLDivElement>();
const activeId = ref("display");
let observer: IntersectionObserver | null = null;

const onSelectNav = (id: string) => {
  document
    .getElementById(`section-${id}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

watch(launchConfig, cfg => {
  if (!cfg) return;
  // Setup observer once sections render.
  nextTick(() => {
    if (!scrollRoot.value) return;
    observer?.disconnect();
    observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) {
          activeId.value = (visible[0].target as HTMLElement).id.replace(
            "section-",
            ""
          );
        }
      },
      {
        root: scrollRoot.value,
        rootMargin: "-10% 0px -80% 0px",
        threshold: 0
      }
    );
    scrollRoot.value
      .querySelectorAll("[data-section]")
      .forEach(el => observer!.observe(el));
  });
});

onUnmounted(() => observer?.disconnect());

// --- Key rebinding dialog ---
const openKeyChanger = (
  label: string,
  valueRef: Ref<number>
) => {
  dialog.create({
    title: label,
    content: () =>
      h(VirtualKeyboard, {
        t: (k: string) => k,
        modelValue: valueRef.value,
        "onUpdate:modelValue": (v: number) => {
          valueRef.value = v;
          dialog.destroyAll();
        }
      })
  });
};

// --- Key bindings (typed so `k.key` indexes options correctly) ---
const keyBindings = computed(() => [
  { key: "keyForward" as const, label: t("gameConfig.inGameOptions.keyForward.label") },
  { key: "keyBackward" as const, label: t("gameConfig.inGameOptions.keyBackward.label") },
  { key: "keyLeft" as const, label: t("gameConfig.inGameOptions.keyLeft.label") },
  { key: "keyRight" as const, label: t("gameConfig.inGameOptions.keyRight.label") },
  { key: "keyLiftCam" as const, label: t("gameConfig.inGameOptions.keyLiftCam.label") },
  { key: "keyRotateCam" as const, label: t("gameConfig.inGameOptions.keyRotateCam.label") }
]);
</script>

<template>
  <div
    v-if="launchConfig && app.selectedInstanceData"
    class="flex h-full"
  >
    <!-- Left nav -->
    <aside class="flex w-48 shrink-0 flex-col border-r">
      <SettingsNav
        :active-id="activeId"
        :items="[
          { id: 'display', label: t('gameConfig.nav.display'), icon: Monitor },
          { id: 'audio', label: t('gameConfig.nav.audio'), icon: Volume2 },
          { id: 'controls', label: t('gameConfig.nav.controls'), icon: Gamepad2 },
          { id: 'gameplay', label: t('gameConfig.nav.gameplay'), icon: BookOpen },
          { id: 'compat', label: t('gameConfig.nav.compat'), icon: Wrench },
          { id: 'graphics', label: t('gameConfig.nav.graphics'), icon: ImageIcon },
          { id: 'advanced', label: t('gameConfig.nav.advanced'), icon: TriangleAlert, badge: t('common.advanced') },
          { id: 'startup', label: t('gameConfig.nav.startup'), icon: Bug, badge: t('common.advanced') }
        ]"
        @select="onSelectNav"
      />
    </aside>

    <!-- Right scroll area -->
    <div
      ref="scrollRoot"
      class="flex-1 overflow-auto"
    >
      <div
        class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur"
      >
        <h1 class="text-base font-semibold">
          {{ t("menu.options") }}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          @click="onOpenConfig"
        >
          <FileText class="size-4" />
          {{ t("gameConfig.openConfigFile") }}
        </Button>
      </div>

      <div class="flex flex-col gap-4 p-6">
        <!-- Display -->
        <section
          :id="`section-display`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.display')"
            :icon="Monitor"
          >
            <NFormWrapper :schema="[
              {
                label: t('gameConfig.graphics.resolution.label'),
                type: 'number-pair',
                valueRef: toRef(launchConfig.Graphics, 'Width'),
                valueRef2: toRef(launchConfig.Graphics, 'Height')
              },
              {
                label: t('gameConfig.graphics.fullScreen.label'),
                type: 'switch',
                valueRef: toRef(launchConfig.Graphics, 'FullScreen')
              },
              {
                label: t('gameConfig.window.borderless.label'),
                tip: t('gameConfig.window.borderless.tip'),
                type: 'switch',
                valueRef: toRef(launchConfig.Window, 'Borderless')
              },
              {
                label: t('gameConfig.window.clipCursor.label'),
                type: 'switch',
                valueRef: toRef(launchConfig.Window, 'ClipCursor')
              },
              {
                label: t('gameConfig.window.alwaysHandleInput.label'),
                tip: t('gameConfig.window.alwaysHandleInput.tip'),
                type: 'switch',
                valueRef: toRef(launchConfig.Window, 'AlwaysHandleInput')
              },
              {
                label: t('gameConfig.window.childWindowRendering.label'),
                type: 'switch',
                valueRef: toRef(launchConfig.Window, 'ChildWindowRendering')
              },
              {
                label: t('gameConfig.window.position.label'),
                tip: t('gameConfig.window.position.tip'),
                type: 'number-pair',
                valueRef: toRef(launchConfig.Window, 'X'),
                valueRef2: toRef(launchConfig.Window, 'Y')
              }
            ]" />
          </FormSection>
        </section>

        <!-- Audio -->
        <section
          :id="`section-audio`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.audio')"
            :icon="Volume2"
          >
            <NFormWrapper :schema="[
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
              }
            ]" />
          </FormSection>
        </section>

        <!-- Controls -->
        <section
          :id="`section-controls`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.controls')"
            :icon="Gamepad2"
          >
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div
                v-for="k in keyBindings"
                :key="k.key"
                class="flex flex-col gap-1.5"
              >
                <Label class="text-xs text-muted-foreground">
                  {{ k.label }}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  @click="openKeyChanger(k.label, toRef(app.selectedInstanceData!.options, k.key))"
                >
                  {{ getKeyName(app.selectedInstanceData!.options[k.key]) }}
                </Button>
              </div>
            </div>

            <Separator class="my-4" />

            <div class="flex items-center justify-between">
              <Label class="text-sm font-medium">
                {{ t("gameConfig.inGameOptions.invertCamRotation.label") }}
              </Label>
              <Switch
                :model-value="!!app.selectedInstanceData!.options.invertCamRotation"
                @update:model-value="v => (app.selectedInstanceData!.options.invertCamRotation = v)"
              />
            </div>
          </FormSection>
        </section>

        <!-- Gameplay -->
        <section
          :id="`section-gameplay`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.gameplay')"
            :icon="BookOpen"
          >
            <NFormWrapper :schema="[
              {
                label: t('gameConfig.game.language.label'),
                tip: t('gameConfig.game.language.tip'),
                type: 'select',
                valueRef: toRef(launchConfig.Game, 'Language'),
                options: [
                  { value: 0, label: t('gameConfig.game.language.options.German') },
                  { value: 1, label: t('gameConfig.game.language.options.English') },
                  { value: 2, label: t('gameConfig.game.language.options.Spanish') },
                  { value: 3, label: t('gameConfig.game.language.options.Italian') },
                  { value: 4, label: t('gameConfig.game.language.options.French') }
                ]
              },
              {
                label: t('gameConfig.game.skipOpening.label'),
                tip: t('gameConfig.game.skipOpening.tip'),
                type: 'switch',
                valueRef: toRef(launchConfig.Game, 'SkipOpening')
              },
              {
                label: t('gameConfig.game.rookie.label'),
                tip: t('gameConfig.game.rookie.tip'),
                type: 'switch',
                valueRef: toRef(launchConfig.Game, 'Rookie')
              },
              {
                label: t('gameConfig.inGameOptions.cloudLayer.label'),
                type: 'switch',
                valueRef: toRef(app.selectedInstanceData!.options, 'cloudLayer')
              }
            ]" />
          </FormSection>
        </section>

        <!-- Compatibility -->
        <section
          :id="`section-compat`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.compat')"
            :icon="Wrench"
          >
            <NFormWrapper :schema="[
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
            ]" />
          </FormSection>
        </section>

        <!-- Graphics (basics) -->
        <section
          :id="`section-graphics`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.graphics')"
            :icon="ImageIcon"
          >
            <NFormWrapper :schema="[
              {
                label: t('gameConfig.graphics.driver.label'),
                type: 'number',
                valueRef: toRef(launchConfig.Graphics, 'Driver')
              },
              {
                label: t('gameConfig.graphics.antialias.label'),
                tip: t('gameConfig.graphics.antialias.tip'),
                type: 'number',
                valueRef: toRef(launchConfig.Graphics, 'Antialias')
              },
              {
                label: t('gameConfig.graphics.bitsPerPixel.label'),
                tip: t('gameConfig.graphics.bitsPerPixel.tip'),
                type: 'number',
                valueRef: toRef(launchConfig.Graphics, 'BitsPerPixel')
              },
              {
                label: t('gameConfig.graphics.vertexCache.label'),
                tip: t('gameConfig.graphics.vertexCache.tip'),
                type: 'number',
                valueRef: toRef(launchConfig.Graphics, 'VertexCache')
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
            ]" />
          </FormSection>
        </section>

        <!-- Advanced graphics -->
        <section
          :id="`section-advanced`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.advanced')"
            :icon="TriangleAlert"
            :badge="t('common.advanced')"
          >
            <NFormWrapper :schema="[
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
                label: t('gameConfig.graphics.disablePerspectiveCorrection.label'),
                type: 'switch',
                valueRef: toRef(launchConfig.Graphics, 'DisablePerspectiveCorrection')
              },
              {
                label: t('gameConfig.graphics.disableFilter.label'),
                type: 'switch',
                valueRef: toRef(launchConfig.Graphics, 'DisableFilter')
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
              }
            ]" />
          </FormSection>
        </section>

        <!-- Startup / debug -->
        <section
          :id="`section-startup`"
          data-section
          class="scroll-mt-16"
        >
          <FormSection
            :title="t('gameConfig.nav.startup')"
            :icon="Bug"
            :badge="t('common.advanced')"
          >
            <NFormWrapper :schema="[
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
                label: t('gameConfig.game.debug.label'),
                tip: t('gameConfig.game.debug.tip'),
                type: 'switch',
                valueRef: toRef(launchConfig.Game, 'Debug')
              }
            ]" />
          </FormSection>
        </section>
      </div>
    </div>
  </div>
</template>
