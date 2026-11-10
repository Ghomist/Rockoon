import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";
import { toast } from "sonner";
import backend from "@/backend";
import { useT } from "@/i18n";
import { hubUrl } from "@/services/hub";
import { usePrefStore } from "@/stores/pref";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 各模式的说明（顺序 = 弹窗里的顺序） */
const MODES: { value: DownloadProxyMode; label: string; desc: string }[] = [
  {
    value: "system",
    label: "settings.network.modeSystem",
    desc: "settings.network.modeSystemDesc"
  },
  {
    value: "custom",
    label: "settings.network.modeCustom",
    desc: "settings.network.modeCustomDesc"
  },
  {
    value: "direct",
    label: "settings.network.modeDirect",
    desc: "settings.network.modeDirectDesc"
  }
];

/** 测试连接打哪个地址：下载站清单页，小、稳、和下载同一条出口 */
const TEST_PATH = "/patches";

const isSocks = (protocol: string) => protocol.startsWith("socks");

/** 代理地址的轻量校验：协议得是 ureq 认的那几个 */
function invalidReason(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid-url";
  }
  if (
    !["http:", "https:", "socks4:", "socks4a:", "socks5:"].includes(
      url.protocol
    )
  ) {
    return "invalid-protocol";
  }
  if (isSocks(url.protocol) && !url.port && !url.hostname) return "invalid-url";
  return null;
}

export default function ProxyDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const savedMode = usePrefStore(s => s.downloadProxyMode);
  const savedProxy = usePrefStore(s => s.downloadProxy);

  const [mode, setMode] = useState<DownloadProxyMode>(savedMode);
  const [proxy, setProxy] = useState(savedProxy);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<NetworkTestResult | null>(null);

  // 每次打开都从 pref 重新取：取消以后不该留着上次没保存的草稿
  useEffect(() => {
    if (!open) return;
    setMode(savedMode);
    setProxy(savedProxy);
    setResult(null);
  }, [open, savedMode, savedProxy]);

  /** 把测试结果的出口翻成人话 */
  const describeExit = (r: NetworkTestResult): string => {
    if (r.exitKind === "direct") return t("settings.network.exitDirect");
    if (r.exitKind === "custom") {
      return r.exitProxy
        ? t("settings.network.summaryCustom", { proxy: r.exitProxy })
        : t("settings.network.exitCustomEmpty");
    }
    if (!r.exitProxy) return t("settings.network.exitSystemNone");
    const source =
      r.exitSource === "env"
        ? t("settings.network.sourceEnv")
        : r.exitSource === "registry"
          ? t("settings.network.sourceRegistry")
          : undefined;
    const base = t("settings.network.exitSystem", { proxy: r.exitProxy });
    return source ? `${base} · ${source}` : base;
  };

  const onTest = async () => {
    const trimmed = proxy.trim();
    if (mode === "custom") {
      if (!trimmed) {
        toast.error(t("settings.network.proxyRequired"));
        return;
      }
      if (invalidReason(trimmed)) {
        toast.error(t("settings.network.proxyInvalid"));
        return;
      }
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await backend.network.test(
        { mode, proxy: trimmed },
        hubUrl(TEST_PATH)
      );
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        exitKind: mode,
        url: hubUrl(TEST_PATH),
        status: 0,
        elapsedMs: 0,
        error: String(e)
      });
    } finally {
      setTesting(false);
    }
  };

  const onSave = () => {
    const trimmed = proxy.trim();
    if (mode === "custom") {
      if (!trimmed) {
        toast.error(t("settings.network.proxyRequired"));
        return;
      }
      if (invalidReason(trimmed)) {
        toast.error(t("settings.network.proxyInvalid"));
        return;
      }
    }
    usePrefStore.setState({
      downloadProxyMode: mode
    });
    toast.success(t("settings.network.saved"));
    onOpenChange(false);
  };

  const proxyDisabled = mode !== "custom";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settings.network.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.network.dialogDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RadioGroup
            value={mode}
            onValueChange={v => {
              setMode(v as DownloadProxyMode);
              setResult(null);
            }}
            className="gap-2"
          >
            {MODES.map(item => (
              <label
                key={item.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 data-[state=checked]:border-primary"
                data-state={mode === item.value ? "checked" : "unchecked"}
              >
                <RadioGroupItem value={item.value} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{t(item.label)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(item.desc)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proxy-address">
              {t("settings.network.proxyLabel")}
            </Label>
            <Input
              id="proxy-address"
              value={proxy}
              disabled={proxyDisabled}
              spellCheck={false}
              placeholder={t("settings.network.proxyPlaceholder")}
              onChange={e => {
                setProxy(e.target.value);
                setResult(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.network.proxyHint")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onTest()}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1 size-3.5" />
              )}
              {testing
                ? t("settings.network.testing")
                : t("settings.network.test")}
            </Button>

            {result && (
              <span className="flex min-w-0 flex-col gap-0.5 text-xs">
                <span
                  className={
                    result.ok
                      ? "flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                      : "flex items-center gap-1 text-destructive"
                  }
                >
                  {result.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0" />
                  )}
                  {result.ok
                    ? t("settings.network.testOk", {
                        elapsed: result.elapsedMs
                      })
                    : t("settings.network.testFail", {
                        error: result.error ?? `HTTP ${result.status}`
                      })}
                </span>
                <span className="truncate text-muted-foreground">
                  {describeExit(result)}
                </span>
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.dialog.cancel")}
          </Button>
          <Button onClick={onSave}>{t("settings.network.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
