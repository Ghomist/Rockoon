import { useCallback, useEffect, useMemo, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";

import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useProfilesStore } from "@/stores/profiles";
import { useT } from "@/i18n";
import { dialog, message } from "@/utils/ui/feedback";
import { matchesQuery } from "@/utils/search";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
import VirtualKeyboard from "@/views/components/VirtualKeyboard";
import { getKeyName } from "@/views/components/key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CFG_DIR = ["ModLoader", "Configs"];

/**
 * Mod 配置页：直接编辑 ModLoader/Configs/*.cfg（BML / BML+ 的 mod 配置）。
 *
 * 两个要点：
 * - 这些文件由 mod 自己在游戏退出时覆写，所以游戏运行中禁止编辑（改了会被冲掉）。
 * - 保存写两份：先写配置文件（游戏立刻生效），再让 profiles 重新捕获一遍，
 *   这样当前配置档里存的也是新值，切换配置档时不会把旧值套回去。
 */
export default function ModConfigs() {
  const t = useT();
  const [configs, setConfigs] = useState<Record<string, ModConfig>>({});
  const [dirty, setDirty] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const instance = useWaitForSelectedInstance(data => load(data.path));

  const fileNames = useMemo(() => {
    const all = Object.keys(configs).sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    );
    if (!query.trim()) return all;
    return all.filter(name => matchesQuery(name, query));
  }, [configs, query]);

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
    const value = Number(current);
    dialog.create({
      title: label,
      content: () => (
        <VirtualKeyboard
          t={k => k}
          value={Number.isFinite(value) ? value : 0}
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

  useEffect(() => {
    if (!instance) setLoading(false);
  }, [instance]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-sm font-medium">{t("menu.modConfigs")}</p>
          <span className="truncate text-xs text-muted-foreground">
            {t("modConfigs.summary", {
              files: fileNames.length,
              total: Object.keys(configs).length
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("modConfigs.searchPlaceholder")}
            aria-label={t("modConfigs.searchPlaceholder")}
            className="h-8 w-48 text-sm lg:w-60"
          />
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
      </header>

      <div className="flex-1 overflow-auto p-4">
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

        {!loading && !error && fileNames.length === 0 && (
          <div className="py-6 text-sm text-muted-foreground">
            {query.trim()
              ? t("modConfigs.noMatch", { query: query.trim() })
              : t("modConfigs.empty")}
          </div>
        )}

        {!loading &&
          !error &&
          fileNames.map(file => {
            const cfg = configs[file];
            const edited = dirty.includes(file);
            return (
              <section
                key={file}
                className="mb-4 overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                  <span className="font-mono text-sm">{file}</span>
                  {edited && (
                    <Badge variant="secondary" className="text-[11px]">
                      {t("modConfigs.dirty")}
                    </Badge>
                  )}
                </div>

                <div className="divide-y">
                  {Object.entries(cfg.entries).map(([category, entries]) => (
                    <div key={category} className="px-4 py-3">
                      {(cfg.categories?.[category] ||
                        Object.keys(cfg.entries).length > 1) && (
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          {cfg.categories?.[category] || category}
                        </p>
                      )}
                      <div className="flex flex-col gap-3">
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
                                  updateEntry(file, category, index, value)
                                }
                                onPickKey={() =>
                                  pickKey(
                                    file,
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
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
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
