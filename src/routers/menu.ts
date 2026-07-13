import { t } from "@/i18n";
import GameConfig from "@/views/GameConfig.vue";
import GameData from "@/views/GameData.vue";
import ResourcesMaps from "@/views/ResourcesMaps.vue";
import ResourcesMods from "@/views/ResourcesMods.vue";
import ResourcesSkys from "@/views/ResourcesSkys.vue";
import Settings from "@/views/Settings.vue";
import Start from "@/views/Start.vue";
import type { Component } from "vue";

export type MenuItem =
  | ({
      label: string;
      route: string;
      icon: string;
    } & (
      | { view: Component; children?: undefined }
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
    icon: "book-2"
  },
  {
    label: t("menu.mappingManual"),
    url: "https://ghomist.github.io/ballance-mapping-manual/",
    icon: "map-pin"
  },
  {
    label: t("menu.forum"),
    url: "https://forum.ballance.top/",
    icon: "message-square"
  },
  {
    label: t("menu.downloadSite"),
    url: "https://dl.ballance.top/",
    icon: "download"
  }
];

export const getMenuItems = (): MenuItem[] => [
  {
    label: t("menu.game"),
    route: "/game",
    icon: "gamepad-2",
    view: Start
  },
  "-",
  {
    label: t("menu.options"),
    route: "/options",
    icon: "sliders-horizontal",
    view: GameConfig
  },
  {
    label: t("menu.data"),
    route: "/data",
    icon: "flag",
    view: GameData
  },
  {
    label: t("menu.resources"),
    route: "/resources",
    icon: "folder",
    children: [
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
      }
    ]
  },
  "-",
  {
    label: t("menu.tools"),
    icon: "wrench",
    route: "/tools",
    children: []
  },
  {
    label: t("menu.settings"),
    route: "/settings",
    icon: "settings",
    view: Settings
  }
];
