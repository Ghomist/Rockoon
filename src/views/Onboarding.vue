<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { message } from "@/utils/ui/feedback";
import { open as browseDir } from "@tauri-apps/plugin-dialog";
import { Rocket, FolderOpen, Loader2 } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const { t } = useI18n();
const router = useRouter();

const picking = ref(false);
const onPickFolder = async () => {
  picking.value = true;
  try {
    const folder = await browseDir({
      directory: true,
      title: t("onboarding.browse.title")
    });
    if (!folder) return;

    const ok = await app.loadInstance(folder);
    if (!ok) {
      message.error(t("onboarding.invalid"));
      return;
    }
    pref.instancePath = folder;
    await profiles.load(); // create .rockoon + default profile
    message.success(t("onboarding.success"));
    router.replace(pref.route || "/game");
  } finally {
    picking.value = false;
  }
};
</script>

<template>
  <div
    class="flex h-screen w-screen items-center justify-center bg-background p-6"
  >
    <div class="w-full max-w-[520px] rounded-2xl border bg-card p-8 text-card-foreground shadow-sm">
      <div class="flex flex-col items-center gap-5">
        <Rocket
          :size="72"
          :class="pref.darkMode ? 'text-foreground' : 'text-emerald-500'"
        />

        <div class="flex flex-col items-center gap-1.5">
          <h1 class="m-0 text-[22px] font-semibold">
            {{ t("onboarding.title") }}
          </h1>
          <p class="text-center text-sm text-muted-foreground">
            {{ t("onboarding.desc") }}
          </p>
        </div>

        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          :disabled="picking"
          @click="onPickFolder"
        >
          <Loader2 v-if="picking" class="size-4 animate-spin" />
          <FolderOpen v-else class="size-4" />
          {{ t("onboarding.pick") }}
        </button>

        <p class="text-center text-xs text-muted-foreground/80">
          {{ t("onboarding.hint") }}
        </p>
      </div>
    </div>
  </div>
</template>
