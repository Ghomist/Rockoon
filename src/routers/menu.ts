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
import Settings from "@/views/Settings";

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
    icon: "book-2"
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
    url: "https://dl.ballance.top/",
    icon: "download"
  }
];

export const getMenuItems = (): MenuItem[] => [
  { label: t("menu.game"), route: "/game", icon: "gamepad-2", view: Start },
  "-",
  {
    label: t("menu.options"),
    route: "/options",
    icon: "sliders-horizontal",
    view: GameConfig
  },
  { label: t("menu.data"), route: "/data", icon: "flag", view: GameData },
  "-",
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
