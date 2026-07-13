import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Square, ExternalLink } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import {
  launchInstance,
  killInstance,
  checkRunningInstance
} from "@/services/launcher";
import { formatPlaytime } from "@/utils/format";
import { useT } from "@/i18n";
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";
import { getExternalLinks } from "@/routers/menu";
import { message } from "@/utils/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LucideIcon = ComponentType<{ className?: string }>;

const resolveIcon = (name: string): LucideIcon => {
  const pascal = name
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return (
    (LucideIcons as unknown as Record<string, LucideIcon>)[pascal] ??
    LucideIcons.Circle
  );
};

const quickLinks = [
  { label: "menu.options", icon: "sliders-horizontal", route: "/options" },
  { label: "menu.maps", icon: "map", route: "/maps" },
  { label: "menu.mods", icon: "puzzle", route: "/mods" },
  { label: "menu.settings", icon: "settings", route: "/settings" }
];

export default function Start() {
  const t = useT();
  const navigate = useNavigate();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const runningInstancePid = useAppStore(s => s.runningInstancePid);
  const playtime = usePrefStore(s => s.playtime);
  const profileCount = useProfilesStore(s => s.profiles.length);

  const [mapCount, setMapCount] = useState(0);
  const [modCount, setModCount] = useState(0);

  useEffect(() => {
    if (!selectedInstanceData) return;
    let cancelled = false;
    (async () => {
      try {
        const mapPath = await join(
          selectedInstanceData.path,
          "ModLoader",
          "Maps"
        );
        const maps = await backend.list(mapPath, ["cmo", "nmo"]);
        if (!cancelled) setMapCount(maps.length);
      } catch {
        if (!cancelled) setMapCount(0);
      }
      try {
        const modPath = await join(
          selectedInstanceData.path,
          "ModLoader",
          "Mods"
        );
        const mods = await backend.list(modPath, ["bmod", "bmodp", "zip"]);
        if (!cancelled) setModCount(mods.length);
      } catch {
        if (!cancelled) setModCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedInstanceData]);

  const onLaunchGame = async () => {
    if (!selectedInstanceData) return;
    if (runningInstancePid) {
      const isRunning = await checkRunningInstance();
      if (isRunning) {
        message.warning(t("home.alreadyRunning"));
        return;
      }
    }
    await launchInstance();
    message.success(t("home.launching"));
  };

  const stats = [
    { label: "home.profileCount", value: profileCount, icon: "layers" },
    {
      label: "home.totalPlaytime",
      value: formatPlaytime(playtime),
      icon: "clock"
    },
    { label: "home.mapCount", value: mapCount, icon: "map" },
    { label: "home.modCount", value: modCount, icon: "puzzle" }
  ];

  const communityLinks = getExternalLinks();

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      {/* Launch hero */}
      <Card className="border-none bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-6">
          {!runningInstancePid ? (
            <Button
              size="lg"
              className="h-auto rounded-full px-16 py-5 text-lg"
              onClick={onLaunchGame}
            >
              <Play className="size-5" />
              {t("home.launch")}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="lg"
              className="h-auto rounded-full px-16 py-5 text-lg"
              onClick={killInstance}
            >
              <Square className="size-5" />
              {t("home.stop")}
            </Button>
          )}
          {selectedInstanceData ? (
            <p className="max-w-full truncate text-sm text-muted-foreground">
              {selectedInstanceData.path}
            </p>
          ) : (
            <p className="text-sm text-amber-500">
              {t("gameConfig.selectInstance")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex items-center justify-around px-3">
        {stats.map(stat => {
          const Icon = resolveIcon(stat.icon);
          return (
            <div key={stat.label} className="flex flex-col items-center gap-1">
              <Icon className="size-5 text-primary" />
              <span className="text-xl font-semibold tabular-nums">
                {stat.value}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(stat.label)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("home.quickLinks")}
        </p>
        <div className="flex flex-wrap gap-4">
          {quickLinks.map(link => {
            const Icon = resolveIcon(link.icon);
            return (
              <Card
                key={link.route}
                className="flex-1 cursor-pointer transition-transform hover:-translate-y-0.5"
                onClick={() => navigate(link.route)}
              >
                <CardContent className="flex flex-col items-center gap-1.5 py-3">
                  <Icon className="size-5 text-primary" />
                  <span className="text-sm">{t(link.label)}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Community */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("menu.community")}
        </p>
        <div className="flex flex-wrap gap-4">
          {communityLinks.map(link => {
            const Icon = resolveIcon(link.icon);
            return (
              <Card
                key={link.url}
                className="flex-1 cursor-pointer transition-transform hover:-translate-y-0.5"
                onClick={() => open(link.url)}
              >
                <CardContent className="flex flex-col items-center gap-1.5 py-3">
                  <Icon className="size-5 text-primary" />
                  <span className="text-sm">{link.label}</span>
                  <ExternalLink className="size-3 opacity-40" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
