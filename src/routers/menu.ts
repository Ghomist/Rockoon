import { lazy, type ComponentType } from "react";
import { t } from "@/i18n";
import { hubUrl } from "@/services/hub";
import { openTasEditorWindow } from "@/services/tasWindow";
import { isMac } from "@/utils/platform";

// ── 页面按需加载 ────────────────────────────────────────────
// 每个页面单独成块，首屏只加载当前页；空闲时再把其它页面预取进来，切页时就不会等网络 / 磁盘。
type PageModule = { default: ComponentType };
const pageLoaders: (() => Promise<PageModule>)[] = [];
const page = (load: () => Promise<PageModule>) => {
  pageLoaders.push(load);
  return lazy(load);
};

/** 空闲时预取所有页面（只触发一次 import，结果由浏览器模块缓存复用）。 */
export const preloadPages = () => {
  for (const load of pageLoaders) void load().catch(() => {});
};

const Start = page(() => import("@/views/Start"));
const GameConfig = page(() => import("@/views/GameConfig"));
const GameData = page(() => import("@/views/GameData"));
const ResourcesMaps = page(() => import("@/views/ResourcesMaps"));
const ResourcesMods = page(() => import("@/views/ResourcesMods"));
const ResourcesSkys = page(() => import("@/views/ResourcesSkys"));
const ResourcesTextures = page(() => import("@/views/ResourcesTextures"));
const ResourcesSounds = page(() => import("@/views/ResourcesSounds"));
const Patches = page(() => import("@/views/Patches"));
const Mapping = page(() => import("@/views/Mapping"));
const MapEditor = page(() => import("@/views/MapEditor"));
const Downloads = page(() => import("@/views/Downloads"));
const Settings = page(() => import("@/views/Settings"));

export type MenuItem =
  | ({
      label: string;
      route: string;
      icon: string;
    } & (
      | { view: ComponentType; children?: undefined }
      | { view?: undefined; children: MenuItem[] }
    ))
  | "-";

/** 不占路由、点一下执行动作的菜单项（如打开 TAS 编辑器窗口）。 */
export type MenuActionItem = {
  label: string;
  icon: string;
  action: () => void;
};

/** 侧边栏里的分组小标题（不占路由，路由树会忽略它） */
export type MenuSectionItem = { section: string };

export type SidebarItem = MenuItem | MenuActionItem | MenuSectionItem;

export type ExternalLinkItem = {
  label: string;
  description: string;
  url: string;
  icon: string;
};

export const getExternalLinks = (): ExternalLinkItem[] => [
  {
    label: t("menu.wiki"),
    description: t("home.wikiDesc"),
    url: "https://ballance.jxpxxzj.cn/wiki/",
    icon: "book-open"
  },
  {
    label: t("menu.mappingManual"),
    description: t("home.mappingManualDesc"),
    url: "https://ghomist.github.io/ballance-mapping-manual/",
    icon: "map-pin"
  },
  {
    label: t("menu.forum"),
    description: t("home.forumDesc"),
    url: "https://forum.ballance.top/",
    icon: "message-square"
  },
  {
    label: t("menu.downloadSite"),
    description: t("home.downloadSiteDesc"),
    url: hubUrl("/"),
    icon: "download"
  },
  {
    label: t("menu.github"),
    description: t("home.githubDesc"),
    url: "https://github.com/Ghomist/Rockoon",
    icon: "github"
  }
];

export const getMenuItems = (
  options: { tasEditor?: boolean } = {}
): SidebarItem[] => [
  { label: t("menu.game"), route: "/game", icon: "gamepad-2", view: Start },
  { section: t("menu.section.game") },
  {
    label: t("menu.patches"),
    route: "/patches",
    icon: "wrench",
    view: Patches
  },
  {
    label: t("menu.options"),
    route: "/options",
    icon: "sliders-horizontal",
    view: GameConfig
  },
  { label: t("menu.data"), route: "/data", icon: "trophy", view: GameData },
  { section: t("menu.section.resources") },
  {
    label: t("menu.maps"),
    route: "/maps",
    icon: "map",
    view: ResourcesMaps
  },
  {
    label: t("menu.mods"),
    route: "/mods",
    icon: "puzzle",
    view: ResourcesMods
  },
  {
    label: t("menu.backgrounds"),
    route: "/backgrounds",
    icon: "image",
    view: ResourcesSkys
  },
  {
    label: t("menu.textures"),
    route: "/textures",
    icon: "palette",
    view: ResourcesTextures
  },
  {
    label: t("menu.musics"),
    route: "/sounds",
    icon: "music",
    view: ResourcesSounds
  },
  { section: t("menu.section.tools") },
  // 内嵌的在线制图器（BVM）：iframe 由 App 里的 MapEditorHost 常驻，这个页面只占位
  {
    label: t("menu.mapEditor"),
    route: "/map-editor",
    icon: "box",
    view: MapEditor
  },
  {
    label: t("menu.mapping"),
    route: "/mapping",
    icon: "pen-tool",
    view: Mapping
  },
  // 实验功能：设置里打开才显示（默认关）。独立窗口：点一下开 TAS 编辑器，不切当前页面
  // macOS 上没有：编辑器要把游戏窗口嵌进来、要读写游戏的共享内存，这两样都是 Win32 专属
  ...(options.tasEditor && !isMac
    ? ([
        {
          label: t("menu.tasEditor"),
          icon: "film",
          action: () => {
            void openTasEditorWindow();
          }
        }
      ] as const)
    : []),
  { section: t("menu.section.app") },
  {
    label: t("menu.downloads"),
    route: "/downloads",
    icon: "arrow-down-to-line",
    view: Downloads
  },
  {
    label: t("menu.settings"),
    route: "/settings",
    icon: "settings",
    view: Settings
  }
];

/** 当前路由对应的菜单项（页面标题栏用它拿名字和图标） */
export const findRouteItem = (
  pathname: string
): { label: string; icon: string } | undefined => {
  const walk = (
    items: SidebarItem[]
  ): { label: string; icon: string } | undefined => {
    for (const it of items) {
      if (it === "-" || !("route" in it)) continue;
      if ("children" in it && it.children) {
        const hit = walk(it.children);
        if (hit) return hit;
      } else if (pathname === it.route || pathname.startsWith(it.route + "/")) {
        return { label: it.label, icon: it.icon };
      }
    }
    return undefined;
  };
  return walk(getMenuItems());
};
