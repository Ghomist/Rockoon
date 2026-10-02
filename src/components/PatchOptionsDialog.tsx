import { Download, Loader2 } from "lucide-react";

import { t } from "@/i18n";
import type { PatchChoice } from "@/services/game";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  value: PatchChoice;
  onChange: (value: PatchChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * 装原版游戏之前问一句「要不要顺便装补丁」。
 * 默认勾选 新 Player + BML+（BML+ 的前提就是新 Player），BML 默认不勾。
 */
export default function PatchOptionsDialog({
  open,
  value,
  onChange,
  onConfirm,
  onCancel,
  busy
}: Props) {
  const rows: { flag: keyof PatchChoice; label: string }[] = [
    { flag: "player", label: t("patches.installOptionsPlayer") },
    { flag: "bmlplus", label: t("patches.installOptionsBmlPlus") },
    { flag: "bml", label: t("patches.installOptionsBml") }
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("patches.installOptionsTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t("patches.installOptionsBody")}
        </p>

        <div className="flex flex-col divide-y">
          {rows.map(row => (
            <label
              key={row.flag}
              className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm"
            >
              <span>{row.label}</span>
              <Switch
                checked={value[row.flag]}
                onCheckedChange={checked =>
                  onChange({ ...value, [row.flag]: checked })
                }
              />
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("patches.installOptionsNote")}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t("patches.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {t("patches.pickFolder")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
