import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Check, Layers, Plus, Pencil, Trash2 } from "lucide-react";
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
import PatchUpdateWatcher from "@/components/PatchUpdateWatcher";
import TitleBarControls from "@/components/TitleBarControls";
import ResourceUpdateGuard from "@/components/ResourceUpdateGuard";
import VanillaGuard from "@/components/VanillaGuard";
import AppBackground from "@/components/AppBackground";

import Onboarding from "@/views/Onboarding";
import { buildImportQueue, packageIdFromUrl } from "@/services/deepLinkImport";
import { AppRoutes } from "@/routers";
import { t } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { dialog, message } from "@/utils/ui/feedback";
import { isMac } from "@/utils/platform";
import { cn } from "@/lib/utils";
import { useAccent, useThemeEffect } from "@/utils/theme";
import { checkRunningInstance } from "@/services/launcher";
import { importFromFile, importFromUrl } from "@/services/brp";
import { installedCopiesOf, resourceKey } from "@/services/resourceUpdates";
import { askSkyTarget } from "@/services/sky";
import backend from "@/backend";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  useAccent();

  // Apply .dark class on <html>（切换时整页淡入淡出）
  useThemeEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, isDark);

  const hasInstance = useAppStore(s => !!s.selectedInstanceData);
  // initStores 还在读实例时不能当「没实例」处理，否则已经选好实例的用户每次
  // 启动都会先被拎到「选游戏目录」的开局页上闪一下（慢盘上能停好几百毫秒）。
  const booted = useAppStore(s => s.booted);

  return (
    <>
      <Toaster richColors closeButton position="top-right" />
      <GlobalDialogHost />
      <TooltipProvider>
        {!booted ? (
          <BootSplash />
        ) : hasInstance ? (
          <MainLayout />
        ) : (
          <Onboarding />
        )}
      </TooltipProvider>
    </>
  );
}

/** 开屏：只铺个 logo（不写字、不弹任何选择），等 initStores 说完话再决定去哪 */
function BootSplash() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <img
        src="/logo.png"
        alt="Rockoon"
        className="size-12 animate-pulse opacity-70 dark:invert"
        draggable={false}
      />
    </div>
  );
}
/** 路径最后一段（Windows / POSIX 都要能分） */
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * 下载站上的地图本地已经有了：问一句要不要覆盖重下。
 * 本地文件可能是被改过名的（反查靠 hash，不靠名字），对不上时把两个名字都摆出来，
 * 并在确认后把旧名字那份删掉 —— 不然同一个地图会在列表里出现两次。
 */
function askRedownload(opts: {
  localName: string;
  hubName: string;
  version: number;
}): Promise<boolean> {
  const renamed = opts.localName !== opts.hubName;
  return new Promise<boolean>(resolve => {
    dialog.create({
      title: t("brp.existing.title"),
      content: renamed
        ? t("brp.existing.bodyRenamed", {
            local: opts.localName,
            hub: opts.hubName,
            version: opts.version
          })
        : t("brp.existing.body", {
            name: opts.localName,
            version: opts.version
          }),
      positiveText: renamed
        ? t("brp.existing.confirmRename")
        : t("brp.existing.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  /**
   * 深链点进来是「一键安装」：先把依赖展开成安装队列（依赖在前、主资源在后，见
   * services/deepLinkImport），再按顺序逐个导入 —— 每个资源都在「下载任务」里登记成
   * 后台任务，开始/进度/结束全写进任务，只在开始与结束时弹 message，没有进度弹窗。
   * `name` 是下载站带来的资源名（可选），没带就用下载站返回的资源名。
   */
  const startDeepLinkImport = useCallback(
    async (url: string, name?: string) => {
      try {
        const queue = await buildImportQueue(url);
        if (queue.length === 0) return;

        // 这个地图本地已经装过（文件 hash 反查到同一个资源）：先问一句，别白下一遍
        const mainTask = queue.find(task => !task.isDependency);
        const instancePath = useAppStore.getState().selectedInstanceData?.path;
        // 本地那份的名字和下载站不一致时，记下来（装完把旧名字那份删掉）
        let stalePath: string | undefined;
        if (mainTask && instancePath) {
          const packageId = packageIdFromUrl(mainTask.url);
          const existing = packageId
            ? (await installedCopiesOf(instancePath, packageId)).find(
                r => r.kind === "map"
              )
            : undefined;
          if (existing) {
            const localName = baseName(existing.path).replace(
              /\.disable$/i,
              ""
            );
            const hubName = existing.hub.asset.name;
            const go = await askRedownload({
              localName,
              hubName,
              version: existing.hub.version
            });
            if (!go) return;
            if (localName !== hubName) stalePath = existing.path;
          }
        }

        // 天空盒包的文件名是 Sky_X_<方位>.bmp（X 是占位符）：装之前问用户装到哪一关
        let skyLetter: SkyLetter | undefined;
        if (queue.some(task => task.category === "sky")) {
          const letter = await askSkyTarget();
          if (letter === null) return; // 用户取消了安装
          skyLetter = letter;
        }

        for (const task of queue) {
          const outcome = await importFromUrl(task.url, skyLetter, {
            title: task.isDependency ? task.name : name || task.name,
            isDependency: task.isDependency,
            // 名字对齐：新文件已经按下载站的名字装好了，旧名字那份就没用了
            onInstalled:
              stalePath && !task.isDependency
                ? async result => {
                    const keep = new Set(
                      result.installedPaths.map(resourceKey)
                    );
                    if (stalePath && !keep.has(resourceKey(stalePath))) {
                      await backend.delete(stalePath).catch(() => {});
                    }
                  }
                : undefined
          });
          // 用户取消了就断掉整条依赖链（失败或去重命中都继续装下一个）
          if (outcome === "cancelled") break;
        }
      } catch (e) {
        message.error(
          t("brp.import.failed", {
            reason: e instanceof Error ? e.message : String(e)
          })
        );
      }
    },
    []
  );
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

    const handleUrl = async (raw: string) => {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "rockoon:") return;
        if (parsed.host === "import") {
          // 把窗口提到最前（还原 → 显示 → 抢焦点），失败不阻塞导入：
          // 单实例回调也会提一次，两边都做是怕浏览器拉起的时机太早、前端监听还没挂上。
          try {
            await getCurrentWindow().unminimize();
            await backend.showWindow();
          } catch {
            /* window API not ready yet — continue */
          }
          const brpUrl = parsed.searchParams.get("url");
          if (brpUrl)
            void startDeepLinkImport(
              brpUrl,
              parsed.searchParams.get("name") ?? undefined
            );
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
  }, [startDeepLinkImport]);

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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* 自定义标题栏（decorations: false）：除了窗口按钮与配置下拉，剩下地方都可按住拖拽。
          注意 items-stretch：窗口按钮靠它撑满整条 header，hover 底色才不会只有一条。
          macOS 用系统的红绿灯（tauri.macos.conf.json 里的 Overlay 标题栏），左边让出位置、不画自己的窗口按钮。 */}
      <header
        data-tauri-drag-region
        className={cn(
          "relative z-20 flex h-12 shrink-0 items-stretch gap-4 border-b bg-sidebar/85 pr-2 backdrop-blur-sm",
          isMac ? "pl-21" : "pl-3.5"
        )}
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <span className="pointer-events-none flex size-7 items-center justify-center rounded-lg border bg-background shadow-xs">
            <img
              src="/logo.png"
              alt="Rockoon"
              className="size-5 dark:invert"
              draggable={false}
            />
          </span>
          <span className="pointer-events-none text-[15px] font-semibold tracking-tight select-none">
            Rockoon
          </span>
          {appVersion && (
            <span className="pointer-events-none rounded-full border px-1.5 py-px font-mono text-[10px] text-muted-foreground select-none">
              v{appVersion}
            </span>
          )}
        </div>
        <div
          data-tauri-drag-region
          className="relative flex flex-1 items-center justify-center self-stretch"
        />
        <div data-tauri-drag-region className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-background/60 pr-2 pl-2.5 font-normal"
              >
                <Layers className="size-3.5 text-primary" />
                <span className="text-muted-foreground">
                  {t("profile.currentLabel")}
                </span>
                <span className="max-w-32 truncate font-medium">
                  {currentProfileName}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("profile.currentLabel")}
              </DropdownMenuLabel>
              {profiles.map(p => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => onSwitchProfile(p.id)}
                >
                  {p.id === currentProfile?.id ? (
                    <Check className="size-4 text-primary" />
                  ) : (
                    <span className="size-4" />
                  )}
                  <span className="truncate">{p.name}</span>
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
                variant="destructive"
                disabled={deleteDisabled}
                onClick={onDeleteProfile}
              >
                <Trash2 className="size-4" />
                {t("profile.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isMac && (
            <span className="pointer-events-none mx-1 h-5 w-px bg-border" />
          )}
          {!isMac && <TitleBarControls />}
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
          <AppBackground />
        </div>
        <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <main className="relative flex-1 overflow-auto">
          <AppRoutes />
        </main>
        <PatchUpdateWatcher />
        <ResourceUpdateGuard />
        <VanillaGuard />
      </div>
    </div>
  );
}
