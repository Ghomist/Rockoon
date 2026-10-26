import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  Clock,
  FolderOpen,
  Map as MapIcon,
  Play,
  Puzzle,
  Square,
  Trophy,
  User
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import {
  launchInstance,
  killInstance,
  checkRunningInstance
} from "@/services/launcher";
import { formatPlaytime, formatTime } from "@/utils/format";
import { useT } from "@/i18n";
import { confirmTasAutoplayOff } from "@/services/tasGuard";
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";
import { getExternalLinks } from "@/routers/menu";
import { message } from "@/utils/ui/feedback";
import { resolveIcon } from "@/utils/icon";
import { useSessionSeconds } from "@/utils/session";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const LEVEL_COUNT = 12;

/** 数字从上一个值缓动到目标值（首页统计数字进场时滚一下） */
function useCountUp(target: number | undefined, duration = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let id = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return target === undefined ? undefined : Math.round(value);
}

export default function Start() {
  const t = useT();
  const navigate = useNavigate();
  const instance = useAppStore(s => s.selectedInstanceData);
  const runningInstancePid = useAppStore(s => s.runningInstancePid);
  // 导入资源包、切换配置都会 triggerRefresh，地图 / 模组数要跟着重数
  const refreshKey = useAppStore(s => s.refreshKey);
  const playtime = usePrefStore(s => s.playtime);
  const session = useSessionSeconds();

  const [mapCount, setMapCount] = useState<number>();
  const [modCount, setModCount] = useState<number>();
  const unlocked = instance?.options.levelLock.filter(Boolean).length ?? 0;
  const shownMaps = useCountUp(mapCount);
  const shownMods = useCountUp(modCount);
  const shownUnlocked = useCountUp(unlocked) ?? 0;

  useEffect(() => {
    if (!instance) return;
    let cancelled = false;
    const count = async (dir: string, exts: string[]) => {
      try {
        const path = await join(instance.path, "ModLoader", dir);
        return (await backend.list(path, exts)).length;
      } catch {
        return 0;
      }
    };
    void count("Maps", ["cmo", "nmo"]).then(n => !cancelled && setMapCount(n));
    void count("Mods", ["bmod", "bmodp", "zip"]).then(
      n => !cancelled && setModCount(n)
    );
    return () => {
      cancelled = true;
    };
    // 只在换实例或收到刷新信号时重数；options 每次改动都会换引用，不能整个对象当依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.path, refreshKey]);

  const onLaunchGame = async () => {
    if (!instance) return;
    if (runningInstancePid) {
      const isRunning = await checkRunningInstance();
      if (isRunning) {
        message.warning(t("home.alreadyRunning"));
        return;
      }
    }
    // BallanceTAS 还开着「启动时自动播放」（TAS 编辑器留下的）就先问一句
    if (!(await confirmTasAutoplayOff(instance.path))) return;
    const pid = await launchInstance();
    // 用户在「原版素材被改过」的提示里选了不启动时不报「正在启动」
    if (pid === undefined) return;
    message.success(t("home.launching"));
  };

  if (!instance) return null;

  const running = !!runningInstancePid;
  const lastPlayer = instance.options.lastPlayer;

  const quickLinks = [
    {
      label: "menu.options",
      desc: "home.optionsDesc",
      icon: "sliders-horizontal",
      route: "/options"
    },
    { label: "menu.maps", desc: "home.mapsDesc", icon: "map", route: "/maps" },
    {
      label: "menu.mods",
      desc: "home.modsDesc",
      icon: "puzzle",
      route: "/mods"
    },
    {
      label: "menu.settings",
      desc: "home.settingsDesc",
      icon: "settings",
      route: "/settings"
    }
  ];

  return (
    <div className="stagger mx-auto flex w-full max-w-5xl flex-col gap-4 p-5 lg:p-6">
      {/* ── 启动区 ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* 天空渐变 + 右侧一颗「球」作装饰 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full border-[18px] border-primary/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 right-24 size-20 rounded-full bg-primary/10 blur-xl"
        />

        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip>{t(`home.player.${instance.playerType}`)}</Chip>
              <Chip muted={instance.modLoaderType === "none"}>
                {t(`home.loader.${instance.modLoaderType}`)}
                {instance.modLoaderType !== "none" &&
                  !instance.modLoaderEnabled &&
                  ` · ${t("home.loaderDisabled")}`}
              </Chip>
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
                Ballance
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {t("home.tagline")}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => void backend.openInExplorer(instance.path)}
              className="group flex max-w-full cursor-pointer items-center gap-1.5 self-start rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
              title={t("common.action.openFolder")}
            >
              <FolderOpen className="size-3.5 shrink-0" />
              <span className="truncate font-mono">{instance.path}</span>
            </button>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
            {!running ? (
              <Button
                key="launch"
                size="lg"
                className="h-12 animate-in rounded-xl px-8 text-base shadow-lg shadow-primary/25 duration-300 fade-in-0 zoom-in-95 hover:-translate-y-px hover:shadow-xl hover:shadow-primary/30"
                onClick={onLaunchGame}
              >
                <Play className="size-5 fill-current" />
                {t("home.launch")}
              </Button>
            ) : (
              <Button
                key="stop"
                variant="destructive"
                size="lg"
                className="h-12 animate-in rounded-xl px-8 text-base shadow-lg shadow-destructive/20 duration-300 fade-in-0 zoom-in-95"
                onClick={killInstance}
              >
                <Square className="size-4 fill-current" />
                {t("home.stop")}
              </Button>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground md:justify-end">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  running
                    ? "animate-pulse bg-success"
                    : "bg-muted-foreground/40"
                )}
              />
              {running
                ? `${t("home.running")} · ${formatTime((session ?? 0) * 1000)}`
                : t("home.ready")}
            </div>
          </div>
        </div>
      </section>

      {/* ── 数据 ─────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Clock />}
          label={t("home.totalPlaytime")}
          value={formatPlaytime(playtime)}
          footer={
            lastPlayer ? t("home.lastPlayer", { name: lastPlayer }) : undefined
          }
          footerIcon={<User className="size-3" />}
        />
        <Stat
          icon={<Trophy />}
          label={t("home.levelsUnlocked")}
          value={
            <>
              {shownUnlocked}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {LEVEL_COUNT}
              </span>
            </>
          }
          footer={
            <Progress
              value={(shownUnlocked / LEVEL_COUNT) * 100}
              className="h-1"
            />
          }
          onClick={() => navigate("/data")}
        />
        <Stat
          icon={<MapIcon />}
          label={t("home.mapCount")}
          value={shownMaps ?? "–"}
          onClick={() => navigate("/maps")}
        />
        <Stat
          icon={<Puzzle />}
          label={t("home.modCount")}
          value={shownMods ?? "–"}
          onClick={() => navigate("/mods")}
        />
      </section>

      {/* ── 快捷入口 + 社区 ─────────────────────────────────── */}
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
          {quickLinks.map(link => {
            const Icon = resolveIcon(link.icon);
            return (
              <button
                key={link.route}
                type="button"
                onClick={() => navigate(link.route)}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t(link.label)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t(link.desc)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>

        <div className="flex flex-col rounded-xl border bg-card p-2 shadow-xs">
          <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
            {t("home.community")}
          </p>
          {getExternalLinks().map(link => {
            const Icon = resolveIcon(link.icon);
            return (
              <button
                key={link.url}
                type="button"
                onClick={() => void open(link.url)}
                title={link.description}
                className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="flex-1 truncate">{link.label}</span>
                <ArrowUpRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Chip({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        muted
          ? "text-muted-foreground"
          : "border-primary/25 bg-primary/10 text-primary"
      )}
    >
      {children}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  footer,
  footerIcon,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  footerIcon?: ReactNode;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-xs",
        onClick &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      {footer &&
        (typeof footer === "string" ? (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {footerIcon}
            {footer}
          </span>
        ) : (
          <div className="mt-auto pt-1">{footer}</div>
        ))}
    </Comp>
  );
}
