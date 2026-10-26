import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Music, Pause, Play } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import { importResources } from "@/services/resourceImport";
import { formatFileSize } from "@/utils/format";
import ListViewPage from "./components/ListViewPage";
import ResourceToolbar from "./components/ResourceToolbar";
import { EmptyState, ExtTag, ResourceRow } from "./components/ResourceRow";
import { cn } from "@/lib/utils";

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

  const onImport = () =>
    importResources({
      title: t("resources.name.sound"),
      native: [],
      targetDir: soundsPath
    });

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
      title={t("sounds.statistics", { cnt: files.length }, files.length)}
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
        <EmptyState icon={<Music />} title={t("sounds.empty")} />
      ) : (
        files.map(file => {
          const isPlaying = playingFile === file.name;
          return (
            <ResourceRow
              key={file.name}
              icon={
                isPlaying ? (
                  <Pause className="fill-current" />
                ) : (
                  <Play className="fill-current" />
                )
              }
              iconClassName={cn(
                "rounded-full",
                isPlaying
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover/row:bg-primary/10 group-hover/row:text-primary"
              )}
              title={
                <span className={cn(isPlaying && "text-primary")}>
                  {file.name}
                </span>
              }
              meta={
                <>
                  <ExtTag>WAV</ExtTag>
                  <span className="tabular-nums">
                    {formatFileSize(file.size)}
                  </span>
                  {isPlaying && (
                    <span className="flex items-center gap-1 text-primary">
                      <AudioLines className="size-3 animate-pulse" />
                      {t("sounds.playing")}
                    </span>
                  )}
                </>
              }
              onClick={() => onTogglePlay(file)}
            />
          );
        })
      )}
    </ListViewPage>
  );
}
