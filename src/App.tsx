import { useEffect, useState } from "react";
import { ChevronDown, Check, Plus, Pencil, Trash2 } from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import GlobalDialogHost from "@/components/GlobalDialogHost";
import TitleBarControls from "@/components/TitleBarControls";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { Particles } from "@/components/ui/particles";
import Onboarding from "@/views/Onboarding";
import { AppRoutes } from "@/routers";
import { t } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { dialog, message } from "@/utils/ui/feedback";
import { checkRunningInstance } from "@/services/launcher";
import { importFromFile, importFromUrl } from "@/services/brp";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  getCurrent as getCurrentDeepLink,
  onOpenUrl
} from "@tauri-apps/plugin-deep-link";
import { useNavigate, useLocation } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";

/** Compute dark-mode state from pref.theme + system preference. */
function useDarkMode(): boolean {
  const theme = usePrefStore(s => s.theme);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return theme === "dark" || (theme === "auto" && systemDark);
}

const promptName = (
  title: string,
  initial: string,
  onOk: (v: string) => void
) => {
  let value = initial;
  dialog.create({
    title,
    content: () => (
      <Input
        defaultValue={initial}
        placeholder={t("profile.namePlaceholder")}
        onChange={e => (value = e.target.value)}
      />
    ),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      const name = value.trim();
      if (name) onOk(name);
    }
  });
};

export default function App() {
  const isDark = useDarkMode();

  // Apply .dark class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const hasInstance = useAppStore(s => !!s.selectedInstanceData);

  return (
    <>
      <Toaster richColors closeButton position="top-right" />
      <GlobalDialogHost />
      <TooltipProvider>
        {hasInstance ? <MainLayout /> : <Onboarding />}
      </TooltipProvider>
    </>
  );
}

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const backgroundType = usePrefStore(s => s.backgroundType);
  const isDark = useDarkMode();

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  // Profile store data
  const profiles = useProfilesStore(s => s.index.profiles);
  const currentProfile = useProfilesStore(s => {
    const idx = s.index;
    return idx.profiles.find(p => p.id === idx.currentId);
  });

  // Restore last route once on mount (initStores has loaded instance already).
  const route = usePrefStore(s => s.route);
  useEffect(() => {
    const target = route || "/game";
    if (target !== location.pathname) navigate(target, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current route on navigation.
  useEffect(() => {
    usePrefStore.setState({ route: location.pathname });
  }, [location.pathname]);

  // Poll running-instance status every second.
  const updateRunningTime = useAppStore(s => s.updateInstanceRunningTime);
  useEffect(() => {
    const id = setInterval(() => {
      checkRunningInstance();
      if (useAppStore.getState().runningInstancePid) updateRunningTime();
    }, 1000);
    return () => clearInterval(id);
  }, [updateRunningTime]);

  // BRP drag-drop + rockoon:// deep-links.
  useEffect(() => {
    let unlistenDragDrop: (() => void) | undefined;
    let unlistenDeepLink: (() => void) | undefined;

    const handleUrl = (raw: string) => {
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

    (async () => {
      unlistenDragDrop = await getCurrentWebview().onDragDropEvent(event => {
        if (event.payload.type === "drop") {
          const brpFiles = event.payload.paths.filter(
            p =>
              p.toLowerCase().endsWith(".brp") ||
              p.toLowerCase().endsWith(".zip")
          );
          brpFiles.forEach(p => importFromFile(p));
        }
      });

      unlistenDeepLink = await onOpenUrl(urls => urls.forEach(handleUrl));
      const startup = await getCurrentDeepLink();
      if (startup) startup.forEach(handleUrl);
    })();

    return () => {
      unlistenDragDrop?.();
      unlistenDeepLink?.();
    };
  }, []);

  const onSwitchProfile = async (id: string) => {
    if (id === currentProfile?.id) return;
    const loading = message.loading(t("profile.switching"));
    try {
      await useProfilesStore.getState().switchProfile(id);
      message.success(t("profile.switched"));
    } catch {
      message.error(t("profile.switchFailed"));
    } finally {
      loading.destroy();
    }
  };

  const onCreateProfile = () =>
    promptName(t("profile.create"), t("profile.defaultName"), async name => {
      await useProfilesStore.getState().createProfile(name);
      message.success(t("profile.created"));
    });

  const onRenameProfile = () => {
    if (!currentProfile) return;
    promptName(t("profile.rename"), currentProfile.name, async name => {
      await useProfilesStore.getState().renameProfile(currentProfile.id, name);
      message.success(t("profile.renamed"));
    });
  };

  const onDeleteProfile = () => {
    if (!currentProfile) return;
    dialog.warning({
      title: t("common.message.warning"),
      content: t("profile.deleteConfirm", { name: currentProfile.name }),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: async () => {
        await useProfilesStore.getState().deleteProfile(currentProfile.id);
        message.success(t("profile.deleted"));
      }
    });
  };

  const currentProfileName = currentProfile?.name ?? t("common.none");
  const deleteDisabled = profiles.length <= 1;

  // Persist route on every render cycle (cheap; only saves pref).
  // Better: subscribe to location changes.
  useEffect(() => {
    const handler = () => {
      const path = window.location.pathname;
      if (path && path !== "/") {
        usePrefStore.setState({ route: path });
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-13 shrink-0 items-center gap-4 border-b bg-background pl-4 pr-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Rockoon"
            className="size-5 rounded-sm"
            draggable={false}
          />
          <span className="select-none text-base font-semibold tracking-tight">
            Rockoon
          </span>
          {appVersion && (
            <span className="select-none text-xs text-muted-foreground">
              v{appVersion}
            </span>
          )}
        </div>
        <div
          data-tauri-drag-region
          className="flex-1 self-stretch"
          aria-hidden="true"
        />
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {t("profile.currentLabel")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {currentProfileName}
                <ChevronDown className="ml-1 size-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuLabel>{t("profile.currentLabel")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profiles.map(p => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => onSwitchProfile(p.id)}
                >
                  {p.id === currentProfile?.id ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCreateProfile}>
                <Plus className="size-4" />
                {t("profile.create")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRenameProfile}>
                <Pencil className="size-4" />
                {t("profile.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={deleteDisabled}
                onClick={onDeleteProfile}
              >
                <Trash2 className="size-4" />
                {t("profile.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TitleBarControls />
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Global background — lives outside <main> and router so route
            changes neither remount it nor let route content height push
            the layout. Sidebar/main sit on top via their own bg-background. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {backgroundType === "particles" ? (
            <Particles
              className="absolute inset-0"
              quantity={120}
              color={isDark ? "#ffffff" : "#000000"}
              ease={80}
              refresh={false}
            />
          ) : (
            <AnimatedGridPattern
              numSquares={40}
              maxOpacity={0.08}
              duration={3}
              repeatDelay={1}
              className="absolute inset-y-[-30%] h-[160%] w-full skew-y-12 [mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
            />
          )}
        </div>
        <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <main className="relative flex-1 overflow-auto">
          <AppRoutes />
        </main>
      </div>
    </div>
  );
}
