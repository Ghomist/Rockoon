import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Folder,
  FolderOpen,
  Map as MapIcon,
  RefreshCw,
  Search
} from "lucide-react";
import backend from "@/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { TAS_LEVELS } from "@/tas/play";
import type { TasMapRef } from "@/tas/prefs";
import { formatFileSize } from "@/utils/format";
import { matchesQuery } from "@/utils/search";

type MapItem = {
  name: string;
  isDir: boolean;
  /** 相对 `ModLoader/Maps` 的路径（正斜杠） */
  rel: string;
  size?: number;
};

const isDisabledFile = (name: string) => /\.disable$/i.test(name);
const stripExt = (name: string) =>
  name.replace(/\.disable$/i, "").replace(/\.(cmo|nmo)$/i, "");
const fileExt = (name: string) =>
  /\.(cmo|nmo)(?:\.disable)?$/i.exec(name)?.[1].toUpperCase() ?? "";

/** 地图的显示名：原版 =「第 N 关」，自制图 = 文件名去掉扩展名。 */
export function mapDisplayName(map: TasMapRef): string {
  if (typeof map === "number") return t("tas.levelN", { n: map });
  return stripExt(map.split("/").pop() ?? map);
}

/**
 * TAS 编辑器右上：地图列表（原版 1~13 关 + `ModLoader/Maps` 里的自制图，可进子目录）。
 * 点一下 = 把它设为当前项目一键播放要进的地图。目录浏览与「自制地图」页（`ResourcesMaps`）一致。
 */
export default function TasMapList({
  instancePath,
  selected,
  guessed,
  disabled,
  onSelect
}: {
  instancePath: string;
  /** 当前项目的地图（记住的或按文件名猜的）；null = 还没有 */
  selected: TasMapRef | null;
  /** `selected` 是按文件名猜出来的（还没手选过） */
  guessed: boolean;
  /** 没打开文件时只能看、不能选 */
  disabled: boolean;
  onSelect: (map: TasMapRef) => void;
}) {
  const root = instancePath ? `${instancePath}/ModLoader/Maps` : "";
  /** 当前所在子目录（相对 root，正斜杠；"" = 根） */
  const [dir, setDir] = useState("");
  const [items, setItems] = useState<MapItem[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (rel: string) => {
      if (!root) return;
      const full = rel ? `${root}/${rel}` : root;
      try {
        const [dirs, files] = await Promise.all([
          backend.listDirs(full),
          backend.list(full, ["cmo", "nmo"])
        ]);
        const join = (name: string) => (rel ? `${rel}/${name}` : name);
        const dirItems = dirs
          .map(d => d.split(/[\\/]/).pop() ?? d)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map(name => ({ name, isDir: true, rel: join(name) }));
        const fileItems = files
          .filter(f => !/[\\/]/.test(f.name))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true })
          )
          .map(f => ({
            name: f.name,
            isDir: false,
            rel: join(f.name),
            size: f.size
          }));
        setItems([...dirItems, ...fileItems]);
      } catch {
        // 目录不存在（还没装过自制图）：当成空的
        setItems([]);
      }
    },
    [root]
  );

  useEffect(() => {
    void load(dir);
  }, [load, dir]);

  const enter = (rel: string) => {
    setQuery("");
    setDir(rel);
  };
  const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";

  const visible = useMemo(
    () => items.filter(i => matchesQuery(i.name, query)),
    [items, query]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
          <MapIcon className="size-3.5 shrink-0" />
          <span className="truncate" title={t("tas.mapsHint")}>
            {t("tas.mapsTitle")}
          </span>
        </span>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("tas.mapsOpenFolder")}
            disabled={!root}
            onClick={() =>
              void backend
                .openInExplorer(
                  (dir ? `${root}/${dir}` : root).replace(/\//g, "\\")
                )
                .catch(() => undefined)
            }
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("tas.reload")}
            disabled={!root}
            onClick={() => void load(dir)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {disabled && (
          <p className="border-b px-3 py-2 text-[11px] text-muted-foreground">
            {t("tas.mapsNoDoc")}
          </p>
        )}

        {/* 原版 1~13 关：一行四个 */}
        <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">
          {t("tas.mapsOriginal")}
        </div>
        <div className="grid grid-cols-4 gap-1 px-2 pb-2">
          {TAS_LEVELS.map(n => {
            const active = selected === n;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(n)}
                title={active && guessed ? t("tas.mapGuessedHint") : undefined}
                className={cn(
                  "h-7 rounded-md border text-xs tabular-nums transition-colors enabled:hover:bg-accent disabled:opacity-50",
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-transparent bg-muted/50",
                  active && guessed && "border-dashed"
                )}
              >
                {t("tas.levelN", { n })}
              </button>
            );
          })}
        </div>

        {/* 自制图：ModLoader/Maps，可进子目录 */}
        <div className="flex items-center gap-2 border-t px-3 pt-2.5 pb-1">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {t("tas.mapsCustom")}
          </span>
          {dir && (
            <span
              className="truncate text-[11px] text-muted-foreground/70"
              title={dir}
            >
              / {dir}
            </span>
          )}
        </div>
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="h-7 pl-7 text-xs"
              placeholder={t("tas.mapsSearch")}
              aria-label={t("tas.mapsSearch")}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>
        <div className="px-1.5 pb-1.5">
          {dir && (
            <button
              type="button"
              onClick={() => enter(parent)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              <ArrowLeft className="size-3.5" />
              {t("tas.mapsBack")}
            </button>
          )}
          {visible.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {query.trim() ? t("tas.mapsSearchNone") : t("tas.mapsEmpty")}
            </p>
          )}
          {visible.map(item => {
            if (item.isDir)
              return (
                <button
                  key={item.rel}
                  type="button"
                  title={item.name}
                  onClick={() => enter(item.rel)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs">{item.name}</span>
                </button>
              );
            const off = isDisabledFile(item.name);
            const active = selected === item.rel;
            return (
              <button
                key={item.rel}
                type="button"
                title={off ? t("tas.mapDisabledFile") : item.name}
                disabled={disabled || off}
                onClick={() => onSelect(item.rel)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent disabled:cursor-default",
                  active && "bg-primary/10 text-primary",
                  disabled && !off && "opacity-60"
                )}
              >
                <MapIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    off ? "text-muted-foreground/40" : "text-primary"
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    active && "font-medium",
                    off && "line-through opacity-60"
                  )}
                >
                  {stripExt(item.name)}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 px-1 py-0 text-[9px]"
                >
                  {fileExt(item.name)}
                </Badge>
                {item.size !== undefined && (
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {formatFileSize(item.size)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
