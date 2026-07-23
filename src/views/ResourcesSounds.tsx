import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import { importFromFile } from "@/services/brp";
import { formatFileSize } from "@/utils/format";
import ListViewPage from "./components/ListViewPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type BackendFile = { name: string; size: number };

export default function ResourcesSounds() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const refreshKey = useAppStore(s => s.refreshKey);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BackendFile[]>([]);
  const [soundsPath, setSoundsPath] = useState("");
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadSounds = async (showMessage = false) => {
    if (!selectedInstanceData) return;
    const path = await join(selectedInstanceData.path, "Sounds");
    setSoundsPath(path);
    try {
      const list = (await backend.list(path, ["wav"])) as BackendFile[];
      setFiles(list);
      if (showMessage) message.success(t("common.action.refreshSuccess"));
    } catch (error) {
      console.error("Failed to load sounds:", error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const getAssetUrl = (filename: string) => {
    if (!filename || !soundsPath) return "";
    return convertFileSrc(`${soundsPath}/${filename}`);
  };

  const onTogglePlay = (file: BackendFile) => {
    if (playingFile === file.name) {
      audioRef.current?.pause();
      setPlayingFile(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(getAssetUrl(file.name));
    audio.play().catch(err => {
      console.error("Audio playback failed:", err);
      message.error(t("sounds.playError"));
    });
    audio.onended = () => setPlayingFile(null);
    audio.onerror = () => {
      setPlayingFile(null);
      message.error(t("sounds.playError"));
    };
    audioRef.current = audio;
    setPlayingFile(file.name);
  };

  const onRefresh = () => {
    setLoading(true);
    void loadSounds(true);
  };

  const onImportBrp = async () => {
    const selected = await browseFile({
      title: t("brp.importButton"),
      multiple: true,
      filters: [{ name: "BRP", extensions: ["brp", "zip"] }]
    });
    if (!selected || !selected.length) return;
    let any = false;
    for (const f of selected as string[]) {
      const result = await importFromFile(f);
      if (result) any = true;
    }
    if (any) onRefresh();
  };

  const onOpenFolder = async () => {
    if (soundsPath) await backend.openInExplorer(soundsPath);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    void loadSounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadSounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <ListViewPage
      title={t(
        "sounds.statistics",
        { cnt: files.length },
        files.length
      )}
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
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("sounds.empty")}
          </div>
        ) : (
          files.map(file => {
            const isPlaying = playingFile === file.name;
            return (
              <div
                key={file.name}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                onClick={() => onTogglePlay(file)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={e => {
                    e.stopPropagation();
                    onTogglePlay(file);
                  }}
                >
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={
                      "truncate text-sm " +
                      (isPlaying ? "text-primary" : "")
                    }
                  >
                    {file.name}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      WAV
                    </Badge>
                    <span>{formatFileSize(file.size)}</span>
                    {isPlaying && (
                      <span className="text-primary">
                        {t("sounds.playing")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ListViewPage>
  );
}
