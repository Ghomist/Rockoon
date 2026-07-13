<script lang="ts" setup>
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  getCurrent as getCurrentDeepLink,
  onOpenUrl
} from "@tauri-apps/plugin-deep-link";
import {
  ChevronDown,
  Check,
  Plus,
  Pencil,
  Trash2
} from "@lucide/vue";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar.vue";
import GlobalDialogHost from "@/components/GlobalDialogHost.vue";
import TitleBarControls from "@/components/TitleBarControls.vue";
import { t } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { dialog, message } from "@/utils/ui/feedback";
import { useLauncherService } from "@/services/launcher";
import { useBrpService } from "@/services/brp";
import Onboarding from "@/views/Onboarding.vue";

const app = useAppStore();
const pref = usePrefStore();
const profiles = useProfilesStore();
const router = useRouter();
const { checkRunningInstance } = useLauncherService();
const { importFromFile, importFromUrl } = useBrpService();

// --- Theme: drive .dark class on <html> from pref.darkMode ---
watch(
  () => pref.darkMode,
  isDark => {
    document.documentElement.classList.toggle("dark", isDark);
  },
  { immediate: true }
);

// --- Sidebar collapse ---
const collapsed = ref(false);

// --- Helpers ---
let unlistenDragDrop: (() => void) | undefined;
let unlistenDeepLink: (() => void) | undefined;
const checkInterval = ref<ReturnType<typeof setInterval>>();

const handleDeepLinkUrl = (raw: string) => {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "rockoon:") return;
    if (parsed.host === "import") {
      const brpUrl = parsed.searchParams.get("url");
      if (brpUrl) importFromUrl(brpUrl);
      else message.warning(t("brp.error.invalidFile"));
    }
  } catch {
    // ignore malformed URLs
  }
};

const handleDeepLinkUrls = (urls: string[]) => urls.forEach(handleDeepLinkUrl);

// --- Profile management ---
const promptName = (
  title: string,
  initial: string,
  onOk: (v: string) => void
) => {
  const inputValue = ref(initial);
  dialog.create({
    title,
    content: () =>
      h(Input, {
        value: inputValue.value,
        placeholder: t("profile.namePlaceholder"),
        "onUpdate:value": (v: string) => {
          inputValue.value = v;
        }
      }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      const name = inputValue.value.trim();
      if (name) onOk(name);
    }
  });
};

const onSwitchProfile = async (id: string) => {
  if (id === profiles.currentProfile?.id) return;
  const loading = message.loading(t("profile.switching"));
  try {
    await profiles.switchProfile(id);
    message.success(t("profile.switched"));
  } catch {
    message.error(t("profile.switchFailed"));
  } finally {
    loading.destroy();
  }
};

const onCreateProfile = () =>
  promptName(t("profile.create"), t("profile.defaultName"), async name => {
    await profiles.createProfile(name);
    message.success(t("profile.created"));
  });

const onRenameProfile = () => {
  const cur = profiles.currentProfile;
  if (!cur) return;
  promptName(t("profile.rename"), cur.name, async name => {
    await profiles.renameProfile(cur.id, name);
    message.success(t("profile.renamed"));
  });
};

const onDeleteProfile = () => {
  const cur = profiles.currentProfile;
  if (!cur) return;
  dialog.warning({
    title: t("common.message.warning"),
    content: t("profile.deleteConfirm", { name: cur.name }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      await profiles.deleteProfile(cur.id);
      message.success(t("profile.deleted"));
    }
  });
};

const currentProfileName = computed(
  () => profiles.currentProfile?.name ?? t("common.none")
);
const deleteDisabled = computed(() => profiles.profiles.length <= 1);

// --- Lifecycle ---
// Persist current route so we can restore it next launch.
router.afterEach(to => {
  pref.route = to.path;
});

onMounted(async () => {
  if (pref.showWelcome) {
    setTimeout(() => message.info(t("message.welcome")), 50);
  }

  // poll running instance status + update play time
  checkInterval.value = setInterval(() => {
    checkRunningInstance();
    if (app.runningInstancePid) app.updateInstanceRunningTime();
  }, 1000);

  // BRP drag-drop
  unlistenDragDrop = await getCurrentWebview().onDragDropEvent(event => {
    if (event.payload.type === "drop") {
      const brpFiles = event.payload.paths.filter(
        p => p.toLowerCase().endsWith(".brp") || p.toLowerCase().endsWith(".zip")
      );
      brpFiles.forEach(p => importFromFile(p));
    }
  });

  // rockoon:// deep-link
  unlistenDeepLink = await onOpenUrl(handleDeepLinkUrls);
  const startupUrls = await getCurrentDeepLink();
  if (startupUrls) handleDeepLinkUrls(startupUrls);
});

onUnmounted(() => {
  if (checkInterval.value) clearInterval(checkInterval.value);
  unlistenDragDrop?.();
  unlistenDeepLink?.();
});
</script>

<template>
  <Toaster rich-colors close-button position="top-right" />
  <GlobalDialogHost />

  <template v-if="app.selectedInstanceData">
    <div class="flex h-screen flex-col bg-background text-foreground">
      <!-- Top bar (also serves as window drag region) -->
      <header
        data-tauri-drag-region
        class="flex h-13 shrink-0 items-center justify-between gap-4 border-b bg-background pl-4 pr-0"
      >
        <!-- Left: app name -->
        <div class="flex items-center">
          <span class="select-none text-base font-semibold tracking-tight">
            Rockoon
          </span>
        </div>

        <!-- Right: profile dropdown + window controls -->
        <div class="flex items-center gap-2">
          <span class="hidden text-sm text-muted-foreground sm:inline">
            {{ t("profile.currentLabel") }}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="sm"
              >
                {{ currentProfileName }}
                <ChevronDown class="ml-1 size-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="min-w-[180px]">
              <DropdownMenuLabel>
                {{ t("profile.currentLabel") }}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-for="p in profiles.profiles"
                :key="p.id"
                @select="onSwitchProfile(p.id)"
              >
                <Check
                  v-if="p.id === profiles.currentProfile?.id"
                  class="size-4"
                />
                <span v-else class="size-4" />
                {{ p.name }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="onCreateProfile">
                <Plus class="size-4" />
                {{ t("profile.create") }}
              </DropdownMenuItem>
              <DropdownMenuItem @select="onRenameProfile">
                <Pencil class="size-4" />
                {{ t("profile.rename") }}
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="deleteDisabled"
                @select="onDeleteProfile"
              >
                <Trash2 class="size-4" />
                {{ t("profile.delete") }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TitleBarControls />
        </div>
      </header>

      <!-- Body -->
      <div class="flex flex-1 overflow-hidden">
        <AppSidebar v-model:collapsed="collapsed" />

        <main class="relative flex-1 overflow-auto">
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" class="view" />
            </transition>
          </router-view>
        </main>
      </div>
    </div>
  </template>
  <Onboarding v-else />
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 150ms ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-slide-enter-to {
  opacity: 1;
  transform: translateY(0);
}
.fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
