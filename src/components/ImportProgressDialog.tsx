import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { t } from "@/i18n";
import { formatBytes } from "@/utils/format";

export type ImportPhase = "connecting" | "downloading" | "importing" | "done";

export interface ImportProgressDialogProps {
  open: boolean;
  phase: ImportPhase;
  percent: number;
  error: string;
  resultText: string;
  /** 不传就没有「取消」按钮（下载中断不了的流程，比如启动器自更新） */
  onCancel?: () => void;
  onClose: () => void;
  /** 覆盖默认（BRP）文案：原版游戏安装复用这个弹窗 */
  labels?: Partial<Record<ImportPhase, string>>;
  /** 已下载 / 总字节数（后端进度事件带回；不知道总大小时 total 为 0） */
  downloaded?: number;
  total?: number;
}

const phaseLabels: Record<ImportPhase, string> = {
  connecting: t("brp.connecting"),
  downloading: t("brp.downloadingTitle"),
  importing: t("brp.importing"),
  done: t("brp.import.successTitle")
};

/** 下载速度：按后端进度事件采样，慢速平滑一下，免得数字乱跳。 */
function useDownloadSpeed(downloaded: number, active: boolean): number {
  const sample = useRef({ bytes: 0, at: 0, speed: 0 });
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    if (!active || downloaded <= 0) {
      sample.current = { bytes: 0, at: 0, speed: 0 };
      setSpeed(0);
      return;
    }

    const now = Date.now();
    const prev = sample.current;
    // 第一帧、或者任务换了（字节数回退）都重新起算
    if (!prev.at || downloaded < prev.bytes) {
      sample.current = { bytes: downloaded, at: now, speed: 0 };
      return;
    }

    const elapsed = now - prev.at;
    // 后端约每 100ms 报一次；攒够 400ms 再算，结果更稳
    if (elapsed < 400) return;

    const instant = ((downloaded - prev.bytes) / elapsed) * 1000;
    const next = prev.speed ? prev.speed * 0.6 + instant * 0.4 : instant;
    sample.current = { bytes: downloaded, at: now, speed: next };
    setSpeed(next);
  }, [downloaded, active]);

  return speed;
}

export default function ImportProgressDialog({
  open,
  phase,
  percent,
  error,
  resultText,
  onCancel,
  onClose,
  labels: labelOverride,
  downloaded = 0,
  total = 0
}: ImportProgressDialogProps) {
  const labels = { ...phaseLabels, ...labelOverride };
  const finished = !!error || phase === "done";
  // 未结束就锁死：没有关闭按钮、Esc / 点遮罩都不关，只能点取消或等它跑完
  const locked = !finished;
  const speed = useDownloadSpeed(downloaded, locked && phase === "downloading");

  const detail =
    percent > 0
      ? [
          `${Math.round(percent)}%`,
          total > 0
            ? t("common.transfer.size", {
                downloaded: formatBytes(downloaded),
                total: formatBytes(total)
              })
            : downloaded > 0
              ? t("common.transfer.sizeUnknown", {
                  downloaded: formatBytes(downloaded)
                })
              : "",
          speed > 0
            ? t("common.transfer.speed", { speed: formatBytes(speed) })
            : ""
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        // Radix 在 Esc / 点遮罩 / 点关闭按钮时都会走这里 —— 下载中一律不关
        if (!v && !locked) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!locked}
        onEscapeKeyDown={e => {
          if (locked) e.preventDefault();
        }}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {error ? t("brp.import.failedTitle") : labels[phase]}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : phase === "done" ? (
            <p className="text-sm text-muted-foreground">{resultText}</p>
          ) : (
            <div className="flex w-full flex-col items-center gap-3">
              {percent > 0 ? (
                <Progress value={percent} className="w-full" />
              ) : (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              )}
              {detail && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {detail}
                </span>
              )}
            </div>
          )}

          {finished ? (
            <Button onClick={onClose} className="self-end">
              {t("common.dialog.confirm")}
            </Button>
          ) : onCancel ? (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t("common.transfer.lockedHint")}
              </span>
              <Button
                variant="outline"
                onClick={onCancel}
                className="shrink-0 self-end"
              >
                <X className="mr-1 size-4" />
                {t("common.dialog.cancel")}
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("common.transfer.lockedHintNoCancel")}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
