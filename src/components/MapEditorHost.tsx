import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, WifiOff } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BVM_URL,
  bvmFrameUrl,
  listenMapEditor,
  setEditorFrame,
  useMapEditorStore
} from "@/services/mapEditor";

/** 等这么久制图器还没说 ready，就当打不开（没网、被墙） */
const LOAD_TIMEOUT = 20000;

/**
 * 内嵌的制图器（BVM）。挂在 <main> 里、不随路由重挂：第一次打开「在线制图器」才创建 iframe，
 * 之后切到别的页面只是藏起来，编辑到一半的地图、撤销记录都还在。
 */
export default function MapEditorHost({ active }: { active: boolean }) {
  const t = useT();
  const visited = useMapEditorStore(s => s.visited);
  const ready = useMapEditorStore(s => s.ready);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => listenMapEditor(), []);

  useEffect(() => {
    if (active && !visited) useMapEditorStore.setState({ visited: true });
  }, [active, visited]);

  useEffect(() => {
    if (!visited) return;
    setEditorFrame(frameRef.current?.contentWindow ?? null);
    setTimedOut(false);
    const timer = setTimeout(() => {
      if (!useMapEditorStore.getState().ready) setTimedOut(true);
    }, LOAD_TIMEOUT);
    return () => {
      clearTimeout(timer);
      setEditorFrame(null);
    };
  }, [visited, reloadKey]);

  // 切回来时把焦点给编辑器，键盘快捷键直接能用
  useEffect(() => {
    if (active && ready) frameRef.current?.focus();
  }, [active, ready]);

  if (!visited) return null;
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 bg-background",
        !active && "invisible pointer-events-none"
      )}
      aria-hidden={!active}
    >
      <iframe
        key={reloadKey}
        ref={frameRef}
        src={bvmFrameUrl()}
        title={t("menu.mapEditor")}
        className="size-full border-0"
        allow="fullscreen; clipboard-read; clipboard-write"
      />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
          {timedOut ? (
            <>
              <WifiOff className="size-8" />
              <p>{t("mapEditor.loadFailed")}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReloadKey(k => k + 1)}
                >
                  {t("mapEditor.retry")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openUrl(BVM_URL)}
                >
                  <ExternalLink className="size-4" />
                  {t("mapEditor.openInBrowser")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin" />
              <p>{t("mapEditor.loading")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
