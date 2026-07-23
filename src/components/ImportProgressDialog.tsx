import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import backend from "@/backend";
import { t } from "@/i18n";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app";
import { describeBrp } from "@/services/brp";

export interface ImportProgressDialogProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

type Phase = "connecting" | "downloading" | "importing" | "done";

/** Flush pending React state to the DOM. */
const yieldToDom = () =>
  new Promise<void>(r => requestAnimationFrame(() => r()));

export default function ImportProgressDialog({
  open,
  url,
  onClose
}: ImportProgressDialogProps) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [resultText, setResultText] = useState("");
  const disposedRef = useRef(false);
  const cancelledRef = useRef(false);
  const downloadPromiseRef = useRef<Promise<unknown> | null>(null);

  // Stable close callback so unmount races don't double-call.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) return;

    disposedRef.current = false;
    cancelledRef.current = false;
    setPhase("connecting");
    setProgress(0);
    setError("");
    setResultText("");

    let disposeEvent: UnlistenFn | undefined;
    listen<{ percent: number }>("download-progress", event => {
      if (disposedRef.current) return;
      setPhase("downloading");
      setProgress(Math.min(event.payload.percent, 99));
    }).then(fn => {
      if (disposedRef.current) {
        fn();
        return;
      }
      disposeEvent = fn;
    });

    (async () => {
      try {
        const tempDir = await backend.getTempDir();
        const fileName =
          url.split("/").pop()?.split("?")[0] || "import.brp";
        const savePath = `${tempDir}\\${fileName}`;

        const instance = useAppStore.getState().selectedInstanceData;
        if (!instance) {
          setError(t("brp.error.noInstance"));
          return;
        }

        // Download — Rust emits download-progress events.
        const dlPromise = backend.downloadFile(url, savePath);
        downloadPromiseRef.current = dlPromise;
        await dlPromise;
        downloadPromiseRef.current = null;
        if (disposedRef.current || cancelledRef.current) return;

        // Flush "importing" state to DOM before blocking work.
        setPhase("importing");
        setProgress(100);
        await yieldToDom();

        // Validate + install (Rust does blocking I/O on a worker thread).
        const result = await backend.importBrp(savePath, instance.path);
        if (disposedRef.current || cancelledRef.current) return;

        setResultText(
          t("brp.import.success", {
            what: describeBrp(result.manifest),
            count: result.installedPaths.length,
            target: result.targetDescription
          })
        );
        setPhase("done");

        useAppStore.getState().triggerRefresh();
      } catch (e: unknown) {
        if (disposedRef.current || cancelledRef.current) return;
        const msg = String(e);
        if (
          msg.includes("Download cancelled") ||
          msg.includes("cancelled")
        ) {
          close();
          return;
        }
        setError(t("brp.import.failed", { reason: msg }));
      }
    })();

    return () => {
      disposedRef.current = true;
      disposeEvent?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    // Fire-and-forget: the Rust loop checks the atomic flag on its own.
    backend.cancelDownload().catch(() => {});
    close();
  }, [close]);

  const phaseLabels: Record<Phase, string> = {
    connecting: t("brp.connecting"),
    downloading: t("brp.downloadingTitle"),
    importing: t("brp.importing"),
    done: t("brp.import.successTitle")
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && close()}>
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
            <Button onClick={close} className="self-end">
              {t("common.dialog.confirm")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleCancel}
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
