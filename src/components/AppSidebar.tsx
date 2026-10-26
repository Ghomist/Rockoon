import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ExternalLink,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { getMenuItems, getExternalLinks, type MenuItem } from "@/routers/menu";
import { useDownloadsStore } from "@/stores/downloads";
import { usePrefStore } from "@/stores/pref";
import { formatTime } from "@/utils/format";
import { resolveIcon } from "@/utils/icon";
import { useSessionSeconds } from "@/utils/session";

interface AppSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

type LeafItem = Extract<MenuItem, { route: string }>;

const openExternal = (url: string) => {
  import("@tauri-apps/plugin-shell").then(m => m.open(url));
};

/** 收起时只剩图标，名字放进右侧的 tooltip */
function WithTip({
  collapsed,
  label,
  children
}: {
  collapsed: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// 选中底色不画在项上，由 <ActiveIndicator> 统一画一块、切页时滑过去。
// 内边距收起 / 展开都一样（px-3 正好让图标在 w-14 里居中），宽度变化时图标不跳
const itemClass = (active: boolean) =>
  cn(
    "group/item relative flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm transition-colors duration-150 outline-none",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    active
      ? "font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  );

/** 项名：收起时淡出（被侧栏宽度裁掉），而不是直接卸载 —— 不然宽度动画一开始字就没了 */
const Label = ({
  collapsed,
  className,
  children
}: {
  collapsed: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <span
    className={cn(
      "truncate transition-opacity duration-200",
      collapsed && "opacity-0",
      className
    )}
  >
    {children}
  </span>
);

/**
 * 选中项的底色 + 左侧竖条。量 nav 里 [data-active] 那一项的位置，
 * 换页时从旧位置滑到新位置；分组展开 / 侧栏收起时用 ResizeObserver 跟着走。
 */
function ActiveIndicator({
  navRef,
  deps
}: {
  navRef: React.RefObject<HTMLElement | null>;
  deps: unknown[];
}) {
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const ready = useRef(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[data-active="true"]');
      if (!el || !el.offsetParent) {
        setStyle(prev => ({ ...prev, opacity: 0 }));
        return;
      }
      setStyle({
        opacity: 1,
        height: el.offsetHeight,
        width: el.offsetWidth,
        left: el.offsetLeft,
        transform: `translateY(${el.offsetTop}px)`,
        // 第一次直接就位，别从顶上滑下来
        transition: ready.current ? undefined : "none"
      });
    };
    measure();
    const id = requestAnimationFrame(() => (ready.current = true));
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    for (const child of Array.from(nav.children)) ro.observe(child);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 rounded-md bg-sidebar-accent transition-[transform,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={style}
    >
      <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-sidebar-primary" />
    </span>
  );
}

export default function AppSidebar({
  collapsed,
  onCollapsedChange
}: AppSidebarProps) {
  const t = useT();
  const location = useLocation();
  // 订阅开关：设置里一切换，入口立刻出现 / 消失
  const tasEditor = usePrefStore(s => s.enableTasEditor);
  const items = getMenuItems({ tasEditor });
  const externals = getExternalLinks();
  const runningDownloads = useDownloadsStore(
    s => s.tasks.filter(x => x.status === "running").length
  );

  // Auto-open the group containing the current route.
  const initialOpenLabel = (() => {
    for (const it of items) {
      if (it !== "-" && "children" in it && it.children) {
        if (
          it.children.some(
            c => c !== "-" && location.pathname.startsWith(c.route)
          )
        ) {
          return it.label;
        }
      }
    }
    return "";
  })();

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(initialOpenLabel ? [initialOpenLabel] : [])
  );

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const navRef = useRef<HTMLElement>(null);

  const isActive = (it: LeafItem) =>
    location.pathname === it.route ||
    location.pathname.startsWith(it.route + "/");

  const trailing = (route: string) =>
    route === "/downloads" && runningDownloads > 0 ? (
      <span
        className={cn(
          "flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4.5 font-semibold text-primary-foreground tabular-nums",
          collapsed
            ? "absolute top-0 right-0.5 min-w-4 text-[9px] leading-4 ring-2 ring-sidebar"
            : "ml-auto"
        )}
      >
        {runningDownloads}
      </span>
    ) : null;

  return (
    <aside
      className={cn(
        "relative z-10 flex shrink-0 flex-col border-r bg-sidebar/85 backdrop-blur-sm transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-14" : "w-52"
      )}
    >
      <nav
        ref={navRef}
        className="relative flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2 py-3 [scrollbar-width:thin]"
      >
        <ActiveIndicator
          navRef={navRef}
          deps={[location.pathname, collapsed, openGroups, tasEditor]}
        />
        {items.map((item, idx) => {
          if (item === "-") {
            return <div key={`sep-${idx}`} className="mx-2 my-2 border-t" />;
          }
          if ("section" in item) {
            // 收起 / 展开高度不变：文字淡出、换成一条分隔线，下面的项不会上下跳
            return (
              <div
                key={`sec-${idx}`}
                className="relative flex h-8 shrink-0 items-end px-3 pb-1 text-[11px] font-medium tracking-wider whitespace-nowrap text-muted-foreground/80 uppercase"
              >
                <Label collapsed={collapsed}>{item.section}</Label>
                <span
                  className={cn(
                    "absolute inset-x-3 bottom-2.5 border-t transition-opacity duration-200",
                    collapsed ? "opacity-100" : "opacity-0"
                  )}
                />
              </div>
            );
          }
          if ("action" in item) {
            const Icon = resolveIcon(item.icon);
            return (
              <WithTip
                key={item.label}
                collapsed={collapsed}
                label={item.label}
              >
                <button
                  type="button"
                  onClick={item.action}
                  className={itemClass(false)}
                >
                  <Icon className="size-4 shrink-0" />
                  <Label collapsed={collapsed}>{item.label}</Label>
                  {!collapsed && (
                    <ExternalLink className="ml-auto size-3 opacity-0 transition-opacity group-hover/item:opacity-50" />
                  )}
                </button>
              </WithTip>
            );
          }
          if ("view" in item && item.view) {
            const Icon = resolveIcon(item.icon);
            const active = isActive(item);
            return (
              <WithTip
                key={item.route}
                collapsed={collapsed}
                label={item.label}
              >
                <Link
                  to={item.route}
                  data-active={active}
                  className={itemClass(active)}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-300",
                      active && "text-sidebar-primary"
                    )}
                  />
                  <Label collapsed={collapsed}>{item.label}</Label>
                  {trailing(item.route)}
                </Link>
              </WithTip>
            );
          }
          if ("children" in item) {
            const Icon = resolveIcon(item.icon);
            const open = openGroups.has(item.label);
            // 子项看不见（分组收起 / 侧栏收起）时，选中态落在分组本身上
            const groupActive =
              (!open || collapsed) &&
              item.children.some(c => c !== "-" && isActive(c));
            return (
              <Collapsible
                key={item.route}
                open={open}
                onOpenChange={() => toggleGroup(item.label)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    data-active={groupActive}
                    className={itemClass(groupActive)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <Label collapsed={collapsed} className="flex-1 text-left">
                      {item.label}
                    </Label>
                    {!collapsed && (
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 opacity-60 transition-transform duration-200",
                          open ? "" : "-rotate-90"
                        )}
                      />
                    )}
                  </button>
                </CollapsibleTrigger>
                {!collapsed && (
                  <CollapsibleContent className="ml-4 overflow-hidden border-l pl-2 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    {item.children.map((child, cidx) => {
                      if (child === "-") {
                        return (
                          <div key={`sep-${cidx}`} className="my-1 border-t" />
                        );
                      }
                      const ChildIcon = resolveIcon(child.icon);
                      const active = isActive(child);
                      return (
                        <Link
                          key={child.route}
                          to={child.route}
                          data-active={active}
                          className={itemClass(active)}
                        >
                          <ChildIcon className="size-4 shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          }
          return null;
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t p-2">
        <GameStatus collapsed={collapsed} />

        <div
          className={cn(
            "flex gap-1",
            collapsed ? "flex-col items-center" : "items-center"
          )}
        >
          {/* 外链收进一个菜单：以前五条常驻占掉半个侧栏，窗口一矮就出滚动条 */}
          <DropdownMenu>
            <WithTip collapsed={collapsed} label={t("sidebar.links")}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(itemClass(false), !collapsed && "flex-1")}
                >
                  <LifeBuoy className="size-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate">{t("sidebar.links")}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
            </WithTip>
            <DropdownMenuContent side="right" align="end" className="w-60">
              <DropdownMenuLabel>{t("menu.community")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {externals.map(link => {
                const Icon = resolveIcon(link.icon);
                return (
                  <DropdownMenuItem
                    key={link.url}
                    onClick={() => openExternal(link.url)}
                    className="items-start gap-2.5 py-2"
                  >
                    <Icon className="mt-0.5 size-4" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm">{link.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {link.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <WithTip
            collapsed
            label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            <button
              type="button"
              aria-label={
                collapsed ? t("sidebar.expand") : t("sidebar.collapse")
              }
              onClick={() => onCollapsedChange(!collapsed)}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </WithTip>
        </div>
      </div>
    </aside>
  );
}

/** 侧栏底部的游戏状态：运行时亮绿点 + 本次已玩时长 */
function GameStatus({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const session = useSessionSeconds();
  const running = session !== undefined;
  const label = running ? t("sidebar.running") : t("sidebar.idle");

  const dot = (
    <span className="relative flex size-2 shrink-0">
      {running && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          running ? "bg-success" : "bg-muted-foreground/40"
        )}
      />
    </span>
  );

  if (collapsed) {
    return (
      <WithTip collapsed label={label}>
        <div className="flex h-6 items-center justify-center">{dot}</div>
      </WithTip>
    );
  }

  return (
    <div className="flex h-8 items-center gap-2.5 px-2.5 text-xs text-muted-foreground">
      {dot}
      <span className="truncate">{label}</span>
      {running && (
        <span className="ml-auto font-mono tabular-nums">
          {formatTime(session * 1000)}
        </span>
      )}
    </div>
  );
}
