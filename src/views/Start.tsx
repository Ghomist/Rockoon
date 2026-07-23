import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Square } from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid";
import { cn } from "@/lib/utils";

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

export default function Start() {
  const t = useT();
  const navigate = useNavigate();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const runningInstancePid = useAppStore(s => s.runningInstancePid);
  const playtime = usePrefStore(s => s.playtime);
  // profiles is a selector fn in the store; the array lives at `index.profiles`.
  const profileCount = useProfilesStore(s => s.index.profiles.length);

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
    }
  ];

  const quickLinks: {
    label: string;
    desc: string;
    icon: string;
    route: string;
    count?: number;
  }[] = [
    {
      label: "menu.options",
      desc: "home.optionsDesc",
      icon: "sliders-horizontal",
      route: "/options"
    },
    {
      label: "menu.maps",
      desc: "home.mapsDesc",
      icon: "map",
      route: "/maps",
      count: mapCount
    },
    {
      label: "menu.mods",
      desc: "home.modsDesc",
      icon: "puzzle",
      route: "/mods",
      count: modCount
    },
    {
      label: "menu.settings",
      desc: "home.settingsDesc",
      icon: "settings",
      route: "/settings"
    }
  ];

  const communityLinks = getExternalLinks().filter(l => l.icon !== "github");

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <BentoGrid className="flex-1">
        {/* Launch hero — wide, prominent */}
        <Card
          className={cn(
            "relative col-span-full flex flex-col items-center justify-center gap-4 overflow-hidden border bg-card py-10 lg:col-span-2",
            "bg-[radial-gradient(ellipse_at_top,_var(--primary)/8%,_transparent_60%)]"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            {!runningInstancePid ? (
              <Button
                size="lg"
                className="h-auto rounded-full px-16 py-5 text-lg shadow-md"
                onClick={onLaunchGame}
              >
                <Play className="size-5" />
                {t("home.launch")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="lg"
                className="h-auto rounded-full px-16 py-5 text-lg shadow-md"
                onClick={killInstance}
              >
                <Square className="size-5" />
                {t("home.stop")}
              </Button>
            )}
            <p className="max-w-full truncate px-6 text-center text-sm text-muted-foreground">
              {selectedInstanceData?.path ?? ""}
            </p>
          </div>
        </Card>

        {/* Remaining stats — sit beside the hero */}
        {stats.map(stat => {
          const Icon = resolveIcon(stat.icon);
          return (
            <Card
              key={stat.label}
              className="col-span-2 flex flex-col items-center justify-center gap-1 border bg-card py-5 lg:col-span-1"
            >
              <Icon className="size-5 text-primary" />
              <span className="text-xl font-semibold tabular-nums">
                {stat.value}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(stat.label)}
              </span>
            </Card>
          );
        })}

        {/* Quick links — one row of 4 on lg. Maps/Mods show their count. */}
        {quickLinks.map(link => {
          const Icon = resolveIcon(link.icon);
          return (
            <BentoCard
              key={link.route}
              name={t(link.label)}
              description={t(link.desc)}
              Icon={Icon}
              className="col-span-2 lg:col-span-1"
              meta={
                link.count !== undefined ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {link.count}
                  </Badge>
                ) : undefined
              }
              onClick={() => navigate(link.route)}
            />
          );
        })}

        {/* Community — one row of 4 on lg */}
        {communityLinks.map(link => {
          const Icon = resolveIcon(link.icon);
          return (
            <BentoCard
              key={link.url}
              name={link.label}
              description={link.description}
              Icon={Icon}
              external
              className="col-span-2 lg:col-span-1"
              onClick={() => open(link.url)}
            />
          );
        })}
      </BentoGrid>
    </div>
  );
}
