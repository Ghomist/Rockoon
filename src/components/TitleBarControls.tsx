import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";

/** Minimize / Maximize-Restore / Close window controls. */
export default function TitleBarControls() {
  const appWindow = getCurrentWindow();

  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      setIsMaximized(await appWindow.isMaximized());
      unlisten = await appWindow.onResized(async () => {
        setIsMaximized(await appWindow.isMaximized());
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [appWindow]);

  const onMin = () => appWindow.minimize();
  const onMax = () => appWindow.toggleMaximize();
  const onClose = () => appWindow.close();

  return (
    <div className="flex shrink-0 items-stretch">
      <button
        type="button"
        aria-label="minimize"
        onClick={onMin}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="maximize"
        onClick={onMax}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {isMaximized ? (
          <Copy className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
