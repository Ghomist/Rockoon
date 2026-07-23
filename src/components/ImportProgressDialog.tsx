import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export type ImportPhase = "connecting" | "downloading" | "importing" | "done";

export interface ImportProgressDialogProps {
  open: boolean;
  phase: ImportPhase;
  progress: number;
  error: string;
  resultText: string;
  onCancel: () => void;
  onClose: () => void;
}

const phaseLabels: Record<ImportPhase, string> = {
  connecting: t("brp.connecting"),
  downloading: t("brp.downloadingTitle"),
  importing: t("brp.importing"),
  done: t("brp.import.successTitle")
};

export default function ImportProgressDialog({
  open,
  phase,
  progress,
  error,
  resultText,
  onCancel,
  onClose
}: ImportProgressDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {error ? t("brp.import.failedTitle") : phaseLabels[phase]}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : phase === "done" ? (
            <p className="text-sm text-muted-foreground">{resultText}</p>
          ) : (
            <>
              <Progress value={progress} />
              <p className="text-center text-xs text-muted-foreground">
                {progress}%
              </p>
            </>
          )}

          {error || phase === "done" ? (
            <Button onClick={onClose} className="self-end">
              {t("common.dialog.confirm")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onCancel}
              className="self-end"
            >
              <X className="mr-1 size-4" />
              {t("common.dialog.cancel")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
