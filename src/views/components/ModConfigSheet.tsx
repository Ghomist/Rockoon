import { useEffect, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { Loader2, Save, TriangleAlert } from "lucide-react";

import backend from "@/backend";
import { useT } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { useProfilesStore } from "@/stores/profiles";
import { dialog, message } from "@/utils/ui/feedback";
import VirtualKeyboard from "@/views/components/VirtualKeyboard";
import { getKeyName } from "@/views/components/key";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

/** 去掉配置文件扩展名当标题用（CameraUtilities.cfg → CameraUtilities） */
export const modNameOf = (fileName: string) =>
  fileName.replace(/\.(cfg|ini)$/i, "");

interface Props {
  instancePath: string;
  /** ModLoader/Configs 下的文件名；null = 关闭 */
  file: string | null;
  onClose: () => void;
}

/**
 * 模组页右侧的配置抽屉：编辑 ModLoader/Configs/<file>（BML / BML+ 的 mod 配置）。
 *
 * - 这些文件由 mod 自己在游戏退出时覆写，所以游戏运行中禁止编辑（改了会被冲掉）。
 * - 保存写两份：先写配置文件（游戏立刻生效），再让 profiles 重新捕获一遍，
 *   这样当前配置档里存的也是新值，切换配置档时不会把旧值套回去。
 */
export default function ModConfigSheet({ instancePath, file, onClose }: Props) {
  const t = useT();
  const [config, setConfig] = useState<ModConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const runningPid = useAppStore(s => s.runningInstancePid);
  const running = !!runningPid && runningPid > 0;

  const pathOf = (name: string) =>
    join(instancePath, "ModLoader", "Configs", name);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    setLoading(true);
    setConfig(null);
    setDirty(false);
    setError("");
    pathOf(file)
      .then(p => backend.readModConfig(p))
      .then(cfg => alive && setConfig(cfg))
      .catch(e => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, instancePath]);

  const updateEntry = (category: string, index: number, value: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      const list = prev.entries[category] ?? [];
      return {
        ...prev,
        entries: {
          ...prev.entries,
          [category]: list.map((e, i) => (i === index ? { ...e, value } : e))
        }
      };
    });
    setDirty(true);
  };

  const pickKey = (
    category: string,
    index: number,
    label: string,
    current: string
  ) => {
    const parsed = Number(current);
    dialog.create({
      title: label,
      // 虚拟键盘一行比默认弹窗宽；要用带 sm: 的类才能盖住 DialogContent 自带的 sm:max-w-lg
      className: "sm:max-w-3xl",
      content: () => (
        <VirtualKeyboard
          t={k => k}
          value={Number.isFinite(parsed) ? parsed : 0}
          onChange={v => {
            updateEntry(category, index, String(v));
            dialog.destroyAll();
          }}
        />
      )
    });
  };

  const save = async () => {
    if (!file || !config || !dirty) return;
    setSaving(true);
    try {
      await backend.saveModConfig(await pathOf(file), config);
      // 让当前配置档重新捕获一遍，避免切换配置档时把旧值套回来
      await useProfilesStore.getState().save();
      setDirty(false);
      message.success(t("modConfigs.saved", { count: 1 }));
      onClose();
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

  const requestClose = () => {
    if (!dirty) return onClose();
    dialog.warning({
      title: t("common.message.warning"),
      content: t("modConfigs.discard"),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: onClose
    });
  };

  return (
    <Sheet open={!!file} onOpenChange={open => !open && requestClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{file ? modNameOf(file) : ""}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            ModLoader/Configs/{file}
          </SheetDescription>
        </SheetHeader>

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
          {error && (
            <div className="py-6 text-sm text-destructive">
              {t("modConfigs.loadFailed", { error })}
            </div>
          )}
          {config &&
            Object.entries(config.entries).map(([category, entries]) => (
              <section
                key={category}
                className="mb-4 overflow-hidden rounded-xl border bg-card"
              >
                <div className="border-b bg-muted/40 px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {config.categories?.[category] || category}
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
                            updateEntry(category, index, value)
                          }
                          onPickKey={() =>
                            pickKey(category, index, entry.name, entry.value)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" size="sm" onClick={requestClose}>
            {t("common.dialog.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!config || saving || running || !dirty}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {t("modConfigs.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
    case "F":
      return (
        <Input
          type="number"
          step={entry.datatype === "I" ? 1 : "any"}
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
