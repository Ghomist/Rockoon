<script setup lang="ts">
import { computed } from "vue";
import { computedAsync } from "@vueuse/core";
import { Play, Square, ExternalLink } from "@lucide/vue";
import * as LucideIcons from "@lucide/vue";
import type { Component } from "vue";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { useLauncherService } from "@/services/launcher";
import { formatPlaytime } from "@/utils/format";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";
import { getExternalLinks } from "@/routers/menu";
import { message } from "@/utils/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const { t } = useI18n();
const router = useRouter();
const { checkRunningInstance, killInstance, launchInstance } =
  useLauncherService();

const profileCount = computed(() => profiles.profiles.length);
const totalPlaytime = computed(() => pref.playtime);

const mapCount = computedAsync(async () => {
  if (!app.selectedInstanceData) return 0;
  try {
    const mapPath = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Maps"
    );
    const maps = await backend.list(mapPath, ["cmo", "nmo"]);
    return maps.length;
  } catch {
    return 0;
  }
}, 0);

const modCount = computedAsync(async () => {
  if (!app.selectedInstanceData) return 0;
  try {
    const modPath = await join(
      app.selectedInstanceData.path,
      "ModLoader",
      "Mods"
    );
    const mods = await backend.list(modPath, ["bmod", "bmodp", "zip"]);
    return mods.length;
  } catch {
    return 0;
  }
}, 0);

const stats = computed(() => [
  { label: "home.profileCount", value: profileCount.value, icon: "layers" },
  {
    label: "home.totalPlaytime",
    value: formatPlaytime(totalPlaytime.value),
    icon: "clock"
  },
  { label: "home.mapCount", value: mapCount.value, icon: "map" },
  { label: "home.modCount", value: modCount.value, icon: "puzzle" }
]);

const onLaunchGame = async () => {
  if (!app.selectedInstanceData) return;
  if (app.runningInstancePid) {
    const isRunning = await checkRunningInstance();
    if (isRunning) {
      message.warning(t("home.alreadyRunning"));
      return;
    }
  }
  await launchInstance();
  message.success(t("home.launching"));
};

const quickLinks = [
  { label: "menu.options", icon: "sliders-horizontal", route: "/options" },
  { label: "menu.maps", icon: "map", route: "/maps" },
  { label: "menu.mods", icon: "puzzle", route: "/mods" },
  { label: "menu.settings", icon: "settings", route: "/settings" }
];

const communityLinks = computed(() => getExternalLinks());

const resolveIcon = (name: string): Component => {
  const pascal = name
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return (
    (LucideIcons as unknown as Record<string, Component>)[pascal] ??
    LucideIcons.CircleIcon
  );
};
</script>

<template>
  <div class="flex h-full flex-col gap-5 p-6">
    <!-- Launch hero -->
    <Card class="border-none bg-card">
      <CardContent class="flex flex-col items-center gap-3 py-6">
        <Button
          v-if="!app.runningInstancePid"
          size="lg"
          class="h-auto rounded-full px-16 py-5 text-lg"
          @click="onLaunchGame"
        >
          <Play class="size-5" />
          {{ t("home.launch") }}
        </Button>
        <Button
          v-else
          variant="destructive"
          size="lg"
          class="h-auto rounded-full px-16 py-5 text-lg"
          @click="killInstance"
        >
          <Square class="size-5" />
          {{ t("home.stop") }}
        </Button>
        <p
          v-if="app.selectedInstanceData"
          class="max-w-full truncate text-sm text-muted-foreground"
        >
          {{ app.selectedInstanceData.path }}
        </p>
        <p v-else class="text-sm text-amber-500">
          {{ t("gameConfig.selectInstance") }}
        </p>
      </CardContent>
    </Card>

    <!-- Stats -->
    <div class="flex items-center justify-around px-3">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="flex flex-col items-center gap-1"
      >
        <component
          :is="resolveIcon(stat.icon)"
          class="size-5 text-primary"
        />
        <span class="text-xl font-semibold tabular-nums">{{ stat.value }}</span>
        <span class="text-xs text-muted-foreground">{{
          t(stat.label)
        }}</span>
      </div>
    </div>

    <!-- Quick links -->
    <section>
      <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t("home.quickLinks") }}
      </p>
      <div class="flex flex-wrap gap-4">
        <Card
          v-for="link in quickLinks"
          :key="link.route"
          class="flex-1 cursor-pointer transition-transform hover:-translate-y-0.5"
          @click="router.push(link.route)"
        >
          <CardContent class="flex flex-col items-center gap-1.5 py-3">
            <component
              :is="resolveIcon(link.icon)"
              class="size-5 text-primary"
            />
            <span class="text-sm">{{ t(link.label) }}</span>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- Community -->
    <section>
      <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t("menu.community") }}
      </p>
      <div class="flex flex-wrap gap-4">
        <Card
          v-for="link in communityLinks"
          :key="link.url"
          class="flex-1 cursor-pointer transition-transform hover:-translate-y-0.5"
          @click="open(link.url)"
        >
          <CardContent class="flex flex-col items-center gap-1.5 py-3">
            <component
              :is="resolveIcon(link.icon)"
              class="size-5 text-primary"
            />
            <span class="text-sm">{{ link.label }}</span>
            <ExternalLink class="size-3 opacity-40" />
          </CardContent>
        </Card>
      </div>
    </section>
  </div>
</template>
