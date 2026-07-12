import BasicIcon from "@/views/components/MgcIcon.vue";
import { t } from "@/i18n";
import GameConfig from "@/views/GameConfig.vue";
import GameData from "@/views/GameData.vue";
import Instances from "@/views/Instances.vue";
import ResourcesMaps from "@/views/ResourcesMaps.vue";
import ResourcesMods from "@/views/ResourcesMods.vue";
import ResourcesSkys from "@/views/ResourcesSkys.vue";
import Settings from "@/views/Settings.vue";
import Start from "@/views/Start.vue";
import { type DefineComponent, h } from "vue";
import type { MenuOption } from "naive-ui";
import { RouterLink } from "vue-router";

type VueComponent = DefineComponent<object, object, any>;
export type MenuItem =
  | ({
      label: string;
      route: string;
      icon: string;
    } & (
      | { view: VueComponent; children?: undefined }
      | { view?: undefined; children: MenuItem[] }
    ))
  | "-";

export type ExternalLinkItem = {
  label: string;
  url: string;
  icon: string;
};

export const getExternalLinks = (): ExternalLinkItem[] => [
  {
    label: t("menu.wiki"),
    url: "https://ballance.jxpxxzj.cn/wiki/",
    icon: "book-2-line"
  },
  {
    label: t("menu.mappingManual"),
    url: "https://ghomist.github.io/ballance-mapping-manual/",
    icon: "map-pin-line"
  },
  {
    label: t("menu.forum"),
    url: "https://forum.ballance.top/",
    icon: "chat-3-line"
  }
];

export const getMenuItems = (): MenuItem[] => [
  {
    label: t("menu.game"),
    route: "/game",
    icon: "game-2-line",
    view: Start
  },
  {
    label: t("menu.instances"),
    route: "/instances",
    icon: "classify-2-line",
    view: Instances
  },
  "-",
  {
    label: t("menu.options"),
    route: "/options",
    icon: "settings-1-line",
    view: GameConfig
  },
  {
    label: t("menu.data"),
    route: "/data",
    icon: "flag-4-line",
    view: GameData
  },
  {
    label: t("menu.resources"),
    route: "/resources",
    icon: "folder-2-line",
    children: [
      {
        label: t("menu.maps"),
        route: "/maps",
        icon: "map-line",
        view: ResourcesMaps
      },
      {
        label: t("menu.mods"),
        route: "/mods",
        icon: "auction-line",
        view: ResourcesMods
      },
      {
        label: t("menu.backgrounds"),
        route: "/backgrounds",
        icon: "world-2-line",
        view: ResourcesSkys
      }
    ]
  },
  "-",
  {
    label: t("menu.tools"),
    icon: "tool-line",
    route: "/tools",
    children: []
  },
  {
    label: t("menu.settings"),
    route: "/settings",
    icon: "settings-2-line",
    view: Settings
  }
];

const mapToMenuOption = (item: MenuItem, parentPath = ""): MenuOption => {
  if (item === "-") return { type: "divider" };

  const route = parentPath + item.route;
  return {
    label: item.view
      ? () => h(RouterLink, { to: route }, { default: () => item.label })
      : item.label,
    key: route,
    icon: () => h(BasicIcon, { icon: item.icon }),
    children: item.children?.map(x => mapToMenuOption(x, route))
  };
};

export const getMenuOptions = (): MenuOption[] =>
  getMenuItems().map(item => mapToMenuOption(item));
