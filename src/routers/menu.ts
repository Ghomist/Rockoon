import type { ComponentType } from "react";
import { t } from "@/i18n";
import Start from "@/views/Start";
import GameConfig from "@/views/GameConfig";
import GameData from "@/views/GameData";
import ResourcesMaps from "@/views/ResourcesMaps";
import ResourcesMods from "@/views/ResourcesMods";
import ResourcesSkys from "@/views/ResourcesSkys";
import ResourcesTextures from "@/views/ResourcesTextures";
import ResourcesSounds from "@/views/ResourcesSounds";
import Patches from "@/views/Patches";
import ModConfigs from "@/views/ModConfigs";
import Downloads from "@/views/Downloads";
import Settings from "@/views/Settings";
import { hubUrl } from "@/services/hub";
import { openTasEditorWindow } from "@/services/tasWindow";
import { isMac } from "@/utils/platform";

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
    label: t("menu.modConfigs"),
    route: "/mod-configs",
    icon: "file-cog",
    view: ModConfigs
  },
  {
    label: t("menu.patches"),
    route: "/patches",
    icon: "wrench",
    view: Patches
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
  { section: t("menu.section.app") },
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
