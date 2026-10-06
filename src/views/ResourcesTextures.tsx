import { useCallback, useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import { importResources } from "@/services/resourceImport";
import ListViewPage from "./components/ListViewPage";
import ResourceToolbar from "./components/ResourceToolbar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type BackendFile = { name: string; size: number };

/** 浏览器不认 TGA，但原版 Textures/ 里就有 16 张 —— 这些交给后端转成 PNG 再显示。 */
const isTga = (name: string) => name.toLowerCase().endsWith(".tga");

export default function ResourcesTextures() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const appRefreshKey = useAppStore(s => s.refreshKey);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BackendFile[]>([]);
  const [texturesPath, setTexturesPath] = useState("");
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [previewFile, setPreviewFile] = useState<BackendFile | null>(null);
  /** TGA 文件名 → 后端转出来的 PNG 地址（空串 = 转不出来） */
  const [tgaUrls, setTgaUrls] = useState<Record<string, string>>({});

  const loadTextures = useCallback(
    async (showMessage = false) => {
      if (!selectedInstanceData) return;
      const path = await join(selectedInstanceData.path, "Textures");
      setTexturesPath(path);
      try {
        const list = (await backend.list(path, [
          "bmp",
          "tga"
        ])) as BackendFile[];
        setFiles(list);
        setRefreshKey(Date.now());
        if (showMessage) message.success(t("common.action.refreshSuccess"));
      } catch (error) {
        console.error("Failed to load textures:", error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedInstanceData, t]
  );

  const getAssetUrl = useCallback(
    (filename: string) =>
      texturesPath
        ? `${convertFileSrc(`${texturesPath}/${filename}`)}?t=${refreshKey}`
        : "",
    [texturesPath, refreshKey]
  );

  /** 缩略图/大图地址：undefined = 还在转（转失败是空串） */
  const getDisplayUrl = (file: BackendFile) =>
    isTga(file.name) ? tgaUrls[file.name] : getAssetUrl(file.name);

  const onRefresh = () => {
    setLoading(true);
    void loadTextures(true);
  };

  const onImport = () =>
    importResources({
      title: t("resources.name.texture"),
      native: [],
      targetDir: texturesPath
    });

  const onOpenFolder = async () => {
    if (texturesPath) await backend.openInExplorer(texturesPath);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    void loadTextures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TGA 先让后端转成 PNG 缓存（Rust 侧按 mtime 复用，前端不必自己缓存）
  useEffect(() => {
    const tgaFiles = files.filter(file => isTga(file.name));
    if (!texturesPath || !tgaFiles.length) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        tgaFiles.map(async file => {
          try {
            const png = await backend.convertTexture(
              `${texturesPath}/${file.name}`
            );
            return [file.name, convertFileSrc(png)] as const;
          } catch (error) {
            console.error("Failed to convert texture:", file.name, error);
            return [file.name, ""] as const;
          }
        })
      );
      if (!cancelled) setTgaUrls(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [files, texturesPath]);

  useEffect(() => {
    void loadTextures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRefreshKey]);

  const previewSrc = previewFile ? getDisplayUrl(previewFile) : undefined;

  return (
    <ListViewPage
      title={t("textures.statistics", { cnt: files.length }, files.length)}
      actions={
        <ResourceToolbar
          onImport={onImport}
          onRefresh={onRefresh}
          onOpenFolder={onOpenFolder}
        />
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {t("textures.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2 p-3">
          {files.map(file => {
            const src = getDisplayUrl(file);
            return (
              <button
                key={file.name}
                type="button"
                className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:border-primary/40 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setPreviewFile(file)}
              >
                {src === undefined ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : src === "" ? (
                  <ImageOff className="size-6 text-muted-foreground" />
                ) : (
                  <img
                    src={src}
                    alt={file.name}
                    className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-background/85 px-1.5 py-1 text-[10px] leading-tight transition-transform group-hover:translate-y-0">
                  <span className="line-clamp-2 break-all">{file.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!previewFile}
        onOpenChange={open => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-[80vw]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex items-center justify-center rounded bg-muted/50 p-4">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={previewFile.name}
                  className="max-h-[70vh] object-contain"
                />
              ) : (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
