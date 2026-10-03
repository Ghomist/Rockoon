import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";

import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useProfilesStore } from "@/stores/profiles";
import { useT } from "@/i18n";
import { dialog, message } from "@/utils/ui/feedback";
import { matchesQuery } from "@/utils/search";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
import SettingsNav, { type NavItem } from "@/views/components/SettingsNav";
import VirtualKeyboard from "@/views/components/VirtualKeyboard";
import { getKeyName } from "@/views/components/key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CFG_DIR = ["ModLoader", "Configs"];

/** 去掉配置文件扩展名，当列表标题用（CameraUtilities.cfg → CameraUtilities） */
const modNameOf = (fileName: string) => fileName.replace(/\.(cfg|ini)$/i, "");

/**
 * Mod 配置页：直接编辑 ModLoader/Configs/*.cfg（BML / BML+ 的 mod 配置）。
 *
 * 版式跟「游戏设置」一致：左边是**有配置文件的 mod**（没配置的 mod 不出现，
 * 它们也没什么东西可改），右边是该 mod 的配置项。
 *
 * 两个要点：
 * - 这些文件由 mod 自己在游戏退出时覆写，所以游戏运行中禁止编辑（改了会被冲掉）。
 * - 保存写两份：先写配置文件（游戏立刻生效），再让 profiles 重新捕获一遍，
 *   这样当前配置档里存的也是新值，切换配置档时不会把旧值套回去。
 */
export default function ModConfigs() {
  const t = useT();
  const [params] = useSearchParams();
  const [configs, setConfigs] = useState<Record<string, ModConfig>>({});
  const [dirty, setDirty] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");

  // 从「模组」页跳过来时带 ?mod=<文件名>，要在加载完之后选中它
  const wanted = params.get("mod") ?? "";
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;

  const runningPid = useAppStore(s => s.runningInstancePid);
  const running = !!runningPid && runningPid > 0;

  const load = useCallback(async (instancePath: string) => {
    setLoading(true);
    try {
      const captured = await useProfilesStore
        .getState()
        .captureModConfigs(instancePath);
      setConfigs(captured);
      setDirty([]);
      setError("");
      setActive(prev => {
        const want = wantedRef.current;
        if (want && captured[want]) return want;
        if (prev && captured[prev]) return prev;
        return Object.keys(captured).sort()[0] ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const instance = useWaitForSelectedInstance(data => load(data.path));

  // 已经加载完了，URL 又指定了另一个 mod（比如从模组页再点一次）
  useEffect(() => {
    if (wanted && configs[wanted]) setActive(wanted);
  }, [wanted, configs]);

  const allFiles = useMemo(
    () => Object.keys(configs).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [configs]
  );

  /** 左侧列表：搜索时只留命中的 mod */
  const navItems: NavItem[] = useMemo(() => {
    const files = query.trim()
      ? allFiles.filter(name => matchesQuery(name, query))
      : allFiles;
    return files.map(name => ({
      id: name,
      label: modNameOf(name),
      badge: dirty.includes(name) ? t("modConfigs.dirty") : undefined
    }));
  }, [allFiles, query, dirty, t]);

  /** 改一个值：就地更新内存里的配置，并记下这个文件被改过 */
  const updateEntry = (
    file: string,
    category: string,
    index: number,
    value: string
  ) => {
    setConfigs(prev => {
      const cfg = prev[file];
      if (!cfg) return prev;
      const list = cfg.entries[category] ?? [];
      const nextEntries = list.map((entry, i) =>
        i === index ? { ...entry, value } : entry
      );
      return {
        ...prev,
        [file]: {
          ...cfg,
          entries: { ...cfg.entries, [category]: nextEntries }
        }
      };
    });
    setDirty(prev => (prev.includes(file) ? prev : [...prev, file]));
  };

  const pickKey = (
    file: string,
    category: string,
    index: number,
    label: string,
    current: string
  ) => {
    const parsed = Number(current);
    dialog.create({
      title: label,
      // 虚拟键盘一行比默认弹窗宽，这里放宽
      className: "max-w-3xl",
      content: () => (
        <VirtualKeyboard
          t={k => k}
          value={Number.isFinite(parsed) ? parsed : 0}
          onChange={v => {
            updateEntry(file, category, index, String(v));
            dialog.destroyAll();
          }}
        />
      )
    });
  };

  const save = async () => {
    if (!instance || dirty.length === 0) return;
    setSaving(true);
    try {
      const cfgDir = await join(instance.path, ...CFG_DIR);
      for (const file of dirty) {
        const cfg = configs[file];
        if (!cfg) continue;
        await backend.saveModConfig(await join(cfgDir, file), cfg);
      }
      // 让当前配置档重新捕获一遍（内部就是读这些文件），避免切换配置档时把旧值套回来
      await useProfilesStore.getState().save();
      setDirty([]);
      message.success(t("modConfigs.saved", { count: dirty.length }));
    } catch (e) {
      message.error(
        t("modConfigs.saveFailed", {
          error: e instanceof Error ? e.message : String(e)
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const activeConfig = active ? configs[active] : undefined;

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r">
        <div className="border-b p-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("modConfigs.searchPlaceholder")}
            aria-label={t("modConfigs.searchPlaceholder")}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {navItems.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {query.trim()
                ? t("modConfigs.noMatch", { query: query.trim() })
                : t("modConfigs.empty")}
            </p>
          ) : (
            <SettingsNav
              items={navItems}
              activeId={active}
              onSelect={setActive}
            />
          )}
        </div>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {t("modConfigs.summary", {
            files: navItems.length,
            total: allFiles.length
          })}
        </div>
      </aside>

      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-mono text-sm">
              {active || t("menu.modConfigs")}
            </h1>
            {active && dirty.includes(active) && (
              <Badge variant="secondary" className="text-[11px]">
                {t("modConfigs.dirty")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!instance || loading || saving}
              onClick={() => instance && void load(instance.path)}
            >
              <RefreshCw className="mr-1 size-4" />
              {t("common.action.refresh")}
            </Button>
            <Button
              size="sm"
              disabled={!instance || saving || running || dirty.length === 0}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Save className="mr-1 size-4" />
              )}
              {t("modConfigs.save")}
              {dirty.length > 0 ? ` (${dirty.length})` : ""}
            </Button>
          </div>
        </div>

        <div className="p-6">
          {running && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{t("modConfigs.running")}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("common.loading")}
            </div>
          )}

          {!loading && error && (
            <div className="py-6 text-sm text-destructive">
              {t("modConfigs.loadFailed", { error })}
            </div>
          )}

          {!loading && !error && !activeConfig && (
            <p className="py-6 text-sm text-muted-foreground">
              {allFiles.length === 0
                ? t("modConfigs.empty")
                : t("modConfigs.pickOne")}
            </p>
          )}

          {!loading &&
            !error &&
            active &&
            activeConfig &&
            Object.entries(activeConfig.entries).map(([category, entries]) => (
              <section
                key={category}
                className="mb-4 overflow-hidden rounded-xl border bg-card"
              >
                <div className="border-b bg-muted/40 px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {activeConfig.categories?.[category] || category}
                  </p>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {entries.map((entry, index) => (
                    <div
                      key={`${category}-${entry.name}`}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <Label className="font-mono text-sm">
                          {entry.name}
                        </Label>
                        {entry.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <EntryField
                          entry={entry}
                          disabled={running || saving}
                          onChange={value =>
                            updateEntry(active, category, index, value)
                          }
                          onPickKey={() =>
                            pickKey(
                              active,
                              category,
                              index,
                              entry.name,
                              entry.value
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}

/** 按 datatype 渲染控件：B 开关 / I 整数 / F 小数 / K 按键 / S 文本 */
function EntryField({
  entry,
  disabled,
  onChange,
  onPickKey
}: {
  entry: ModConfigEntry;
  disabled: boolean;
  onChange: (value: string) => void;
  onPickKey: () => void;
}) {
  switch (entry.datatype) {
    case "B":
      return (
        <Switch
          checked={entry.value === "1" || entry.value.toLowerCase() === "true"}
          disabled={disabled}
          onCheckedChange={checked => onChange(checked ? "1" : "0")}
        />
      );
    case "I":
      return (
        <Input
          type="number"
          step={1}
          value={entry.value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-28 text-right tabular-nums"
        />
      );
    case "F":
      return (
        <Input
          type="number"
          step="any"
          value={entry.value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-28 text-right tabular-nums"
        />
      );
    case "K":
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onPickKey}
          className="w-28 justify-center font-mono"
        >
          {getKeyName(Number(entry.value)) || entry.value}
        </Button>
      );
    default:
      return (
        <Input
          value={entry.value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-56"
        />
      );
  }
}
