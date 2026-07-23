import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import ListViewPage from "./components/ListViewPage";
import SkyboxPreview, { type SkyboxLevel } from "./components/SkyboxPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LEVEL_LETTERS = [
  "L",
  "E",
  "A",
  "F",
  "C",
  "H",
  "D",
  "G",
  "K",
  "B",
  "J",
  "I"
] as const;
const DIRECTIONS = ["Front", "Back", "Left", "Right", "Down"] as const;
type SkyDir = (typeof DIRECTIONS)[number];

type SkyboxFiles = { [K in SkyDir]?: string };

type BackendFile = { name: string; size: number };

function parseSkyboxFilename(
  filename: string
): { level: number; direction: string } | null {
  const match = filename.match(/^Sky_([A-Z]+)_([A-Za-z]+)\.bmp$/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const direction = match[2];
  const levelIndex = LEVEL_LETTERS.indexOf(
    letter as (typeof LEVEL_LETTERS)[number]
  );
  if (levelIndex === -1) return null;
  return { level: levelIndex + 1, direction };
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

export default function ResourcesSkys() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const appRefreshKey = useAppStore(s => s.refreshKey);
  const [loading, setLoading] = useState(true);
  const [skyboxLevels, setSkyboxLevels] = useState<SkyboxLevel[]>([]);
  const [skysPath, setSkysPath] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<SkyboxLevel | null>(null);
  const [refreshKey, setRefreshKey] = useState(Date.now());

  const loadSkyboxes = async (showMessage = false) => {
    if (!selectedInstanceData) return;
    const path = await join(selectedInstanceData.path, "Textures", "Sky");
    setSkysPath(path);
    try {
      const files = (await backend.list(path, ["bmp"])) as BackendFile[];
      const levelsMap = new Map<number, SkyboxFiles>();
      for (const file of files) {
        const parsed = parseSkyboxFilename(file.name);
        if (parsed) {
          if (!levelsMap.has(parsed.level)) levelsMap.set(parsed.level, {});
          const dir = capitalizeFirst(parsed.direction);
          if ((DIRECTIONS as readonly string[]).includes(dir)) {
            const entry = levelsMap.get(parsed.level);
            if (entry) (entry as Record<string, string>)[dir] = file.name;
          }
        }
      }
      const levels: SkyboxLevel[] = [];
      for (const letter of LEVEL_LETTERS) {
        const levelNum = LEVEL_LETTERS.indexOf(letter) + 1;
        const files = levelsMap.get(levelNum);
        if (files && Object.keys(files).length > 0) {
          levels.push({ level: levelNum, letter, files });
        }
      }
      setSkyboxLevels(levels);
      setRefreshKey(Date.now());
      if (showMessage) message.success(t("common.action.refreshSuccess"));
    } catch (error) {
      console.error("Failed to load skyboxes:", error);
      setSkyboxLevels([]);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (filename: string) => {
    if (!filename || !skysPath) return "";
    const fullPath = `${skysPath}/${filename}`;
    return convertFileSrc(fullPath) + `?t=${refreshKey}`;
  };

  const getThumbnailUrl = (level: SkyboxLevel) => {
    if (level.files.Down && skysPath) {
      const fullPath = `${skysPath}/${level.files.Down}`;
      return convertFileSrc(fullPath) + `?t=${refreshKey}`;
    }
    return "";
  };

  const onOpenFolder = async () => {
    if (skysPath) await backend.openInExplorer(skysPath);
  };

  useEffect(() => {
    void loadSkyboxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadSkyboxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRefreshKey]);

  return (
    <ListViewPage
      title={t(
        "skys.statistics",
        { cnt: skyboxLevels.length },
        skyboxLevels.length
      )}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSkyboxes(true)}
          >
            {t("common.action.refresh")}
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
        ) : skyboxLevels.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("skys.empty")}
          </div>
        ) : (
          <div className="flex flex-wrap justify-around gap-4 p-4">
            {skyboxLevels.map(level => {
              const thumb = getThumbnailUrl(level);
              return (
                <Card
                  key={level.level}
                  className="w-[200px] cursor-pointer transition-transform hover:-translate-y-0.5"
                  onClick={() => {
                    setSelectedLevel(level);
                    setShowPreview(true);
                  }}
                >
                  <CardContent className="flex flex-col items-center gap-2 py-3">
                    {thumb && (
                      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-muted">
                        <img
                          src={thumb}
                          alt={`Level ${level.level}`}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    )}
                    <p className="text-center text-sm">
                      {t("skys.levelName", { level: level.level })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[60vw]">
          <DialogHeader>
            <DialogTitle>
              {t("skys.previewTitle", { level: selectedLevel?.level ?? 0 })}
            </DialogTitle>
          </DialogHeader>
          {selectedLevel && (
            <SkyboxPreview
              level={selectedLevel}
              skysPath={skysPath}
              getImageUrl={getImageUrl}
            />
          )}
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
