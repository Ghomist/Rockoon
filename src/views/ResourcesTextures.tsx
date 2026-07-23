import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import { importFromFile } from "@/services/brp";
import ListViewPage from "./components/ListViewPage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type BackendFile = { name: string; size: number };

export default function ResourcesTextures() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const appRefreshKey = useAppStore(s => s.refreshKey);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BackendFile[]>([]);
  const [texturesPath, setTexturesPath] = useState("");
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [previewFile, setPreviewFile] = useState<BackendFile | null>(null);

  const loadTextures = useCallback(async (showMessage = false) => {
    if (!selectedInstanceData) return;
    const path = await join(selectedInstanceData.path, "Textures");
    setTexturesPath(path);
    try {
      // ponytail: only BMP — TGA/AVI not renderable by browsers, converting needs backend work
      const list = (await backend.list(path, ["bmp"])) as BackendFile[];
      setFiles(list);
      setRefreshKey(Date.now());
      if (showMessage) message.success(t("common.action.refreshSuccess"));
    } catch (error) {
      console.error("Failed to load textures:", error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedInstanceData, t]);

  const getAssetUrl = useCallback(
    (filename: string) =>
      texturesPath
        ? `${convertFileSrc(`${texturesPath}/${filename}`)}?t=${refreshKey}`
        : "",
    [texturesPath, refreshKey]
  );

  const onRefresh = () => {
    setLoading(true);
    void loadTextures(true);
  };

  const onImportBrp = async () => {
    const selected = await browseFile({
      title: t("brp.importButton"),
      multiple: true,
      filters: [{ name: "BRP", extensions: ["brp", "zip"] }]
    });
    if (!selected?.length) return;
    let any = false;
    for (const f of selected as string[]) {
      if (await importFromFile(f)) any = true;
    }
    if (any) onRefresh();
  };

  const onOpenFolder = async () => {
    if (texturesPath) await backend.openInExplorer(texturesPath);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    void loadTextures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTextures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRefreshKey]);

  return (
    <ListViewPage
      title={t("textures.statistics", { cnt: files.length }, files.length)}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            {t("common.action.refresh")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onImportBrp}>
            {t("brp.importButton")}
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenFolder}>
            {t("common.action.openFolder")}
          </Button>
        </>
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
          {files.map(file => (
            <button
              key={file.name}
              type="button"
              className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:border-primary/40 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setPreviewFile(file)}
            >
              <img
                src={getAssetUrl(file.name)}
                alt={file.name}
                className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 translate-y-full bg-background/85 px-1.5 py-1 text-[10px] leading-tight transition-transform group-hover:translate-y-0">
                <span className="line-clamp-2 break-all">{file.name}</span>
              </div>
            </button>
          ))}
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
              <img
                src={getAssetUrl(previewFile.name)}
                alt={previewFile.name}
                className="max-h-[70vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
