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

  // 与 header 里的其它按钮（配置下拉）保持一致：size-8 圆角图标按钮 + 微小间距，
  // 而不是撑满整条标题栏的方角条。
  const btn =
    "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="minimize"
        onClick={onMin}
        className={`${btn} hover:bg-accent hover:text-foreground`}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="maximize"
        onClick={onMax}
        className={`${btn} hover:bg-accent hover:text-foreground`}
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
        className={`${btn} hover:bg-red-600 hover:text-white`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
