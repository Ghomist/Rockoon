import { X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export type ImportPhase =
  | "connecting"
  | "downloading"
  | "importing"
  | "done";

export interface ImportProgressDialogProps {
  open: boolean;
  phase: ImportPhase;
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

        <div className="flex flex-col items-center gap-4 py-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : phase === "done" ? (
            <p className="text-sm text-muted-foreground">{resultText}</p>
          ) : (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
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
