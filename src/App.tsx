import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import GlobalDialogHost from "@/components/GlobalDialogHost";
import PatchUpdateWatcher from "@/components/PatchUpdateWatcher";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import TitleBarControls from "@/components/TitleBarControls";
import ResourceUpdateGuard from "@/components/ResourceUpdateGuard";
import VanillaGuard from "@/components/VanillaGuard";
import AppBackground from "@/components/AppBackground";
import MapEditorHost from "@/components/MapEditorHost";
import Onboarding from "@/views/Onboarding";
import { useIncomingLinks } from "@/hooks/useIncomingLinks";
import { MAP_EDITOR_ROUTE } from "@/services/mapEditor";
import { checkRunningInstance } from "@/services/launcher";
import { AppRoutes } from "@/routers";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { isMac } from "@/utils/platform";
import { cn } from "@/lib/utils";
import { useAccent, useDarkMode } from "@/utils/theme";
import { useNavigate, useLocation } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";

export default function App() {
  // pref.theme + 系统偏好 → <html> 上的 dark 类（切换时整页淡入淡出）
  useDarkMode();
  useAccent();

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
function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  useIncomingLinks();

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

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
      if (useAppStore.getState().runningInstancePid) updateRunningTime(30);
    }, 1000);
    return () => clearInterval(id);
  }, [updateRunningTime]);

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
          <ProfileSwitcher />
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
          <MapEditorHost active={location.pathname === MAP_EDITOR_ROUTE} />
        </main>
        <PatchUpdateWatcher />
        <ResourceUpdateGuard />
        <VanillaGuard />
      </div>
    </div>
  );
}
