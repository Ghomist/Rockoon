import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // 用 shadcn 的 Button（ghost + icon-sm），与 header 里其它图标按钮同一套样式；
  // 关闭按钮只把悬停色换成红色（窗口关闭的惯例）
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-muted-foreground"
        aria-label="minimize"
        onClick={onMin}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-muted-foreground"
        aria-label="maximize"
        onClick={onMax}
      >
        {isMaximized ? (
          <Copy className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-muted-foreground hover:bg-red-600 hover:text-white dark:hover:bg-red-600"
        aria-label="close"
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}
