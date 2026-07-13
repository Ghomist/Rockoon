import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import ListViewPage from "./components/ListViewPage";
import SkyboxPreview, { type SkyboxLevel } from "./components/SkyboxPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

type SkyFile = { path: string; direction: string };
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
  const [loading, setLoading] = useState(true);
  const [skyboxLevels, setSkyboxLevels] = useState<SkyboxLevel[]>([]);
  const [skysPath, setSkysPath] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<SkyboxLevel | null>(null);
  const [refreshKey, setRefreshKey] = useState(Date.now());

  const [importing, setImporting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [selectedImportFiles, setSelectedImportFiles] = useState<SkyFile[]>([]);
  const [selectedImportLevel, setSelectedImportLevel] = useState<number | null>(
    null
  );
  const importTempDirRef = useRef<string | null>(null);

  const loadSkyboxes = async () => {
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
    } catch (error) {
      console.error("Failed to load skyboxes:", error);
      setSkyboxLevels([]);
    } finally {
      setLoading(false);
    }
    message.success(t("common.action.refreshSuccess"));
  };

  const cleanupTempDir = async (dirPath: string) => {
    try {
      await backend.remove_dir(dirPath);
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  };

  const onImportSkybox = async () => {
    const zipFile = await browseFile({
      title: t("skys.import.selectZip"),
      multiple: false,
      filters: [{ name: "Archive", extensions: ["zip"] }]
    });
    if (!zipFile || (zipFile as unknown as string[]).length === 0) return;

    setImporting(true);
    setImportLoading(true);

    const systemTempDir = await backend.getTempDir();
    const tempDir = await join(systemTempDir, "rockoon_skybox_" + Date.now());

    try {
      await backend.mkdir(tempDir);
      await backend.unzip(zipFile as string, tempDir);
      const analysis = await backend.analyzeSkyboxFiles(tempDir);

      if (analysis.files.length === 0) {
        message.error(t("skys.import.detectionError"));
        await cleanupTempDir(tempDir);
        return;
      }

      const missing = (DIRECTIONS as readonly string[]).filter(
        dir => !analysis.directions.includes(dir)
      );
      if (missing.length > 0) {
        message.warning(
          t("skys.import.incomplete", { missing: missing.join(", ") })
        );
      }

      setSelectedImportFiles(analysis.files);
      importTempDirRef.current = tempDir;
      message.success(
        t("skys.import.detectionSuccess", {
          cnt: analysis.files.length,
          dirs: analysis.directions.join(", ")
        })
      );
      setSelectedImportLevel(null);
      setShowLevelPicker(true);
      setImportLoading(false);
    } catch (error) {
      console.error("Import error:", error);
      message.error(t("skys.import.detectionError"));
      setImportLoading(false);
      await cleanupTempDir(tempDir);
    }
  };

  const onCancelImport = async () => {
    if (importTempDirRef.current) {
      await cleanupTempDir(importTempDirRef.current);
      importTempDirRef.current = null;
    }
    setImporting(false);
    setImportLoading(false);
    setShowLevelPicker(false);
    setSelectedImportFiles([]);
    setSelectedImportLevel(null);
  };

  const onSelectLevel = async () => {
    if (selectedImportLevel === null) {
      message.warning(t("skys.import.selectLevel"));
      return;
    }
    if (!importTempDirRef.current) {
      message.error("Import temp directory not found");
      return;
    }
    if (!selectedInstanceData) return;
    const levelNum = selectedImportLevel;
    const levelLetter = LEVEL_LETTERS[levelNum - 1];
    const targetDir = await join(selectedInstanceData.path, "Textures", "Sky");
    try {
      for (const file of selectedImportFiles) {
        const targetFile = await join(
          targetDir,
          `Sky_${levelLetter}_${file.direction}.bmp`
        );
        await backend.copy(file.path, targetFile);
      }
      message.success(t("skys.import.replaceSuccess", { level: levelNum }));
      await loadSkyboxes();
      setRefreshKey(Date.now());
      setShowLevelPicker(false);
      setImporting(false);
      setSelectedImportFiles([]);
      setSelectedImportLevel(null);
    } catch (error) {
      console.error("Replace error:", error);
      message.error(t("skys.import.replaceError"));
    } finally {
      if (importTempDirRef.current) {
        await cleanupTempDir(importTempDirRef.current);
        importTempDirRef.current = null;
      }
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
    return () => {
      if (importTempDirRef.current) {
        void cleanupTempDir(importTempDirRef.current);
        importTempDirRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            onClick={() => void loadSkyboxes()}
          >
            {t("common.action.refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenFolder}>
            {t("common.action.openFolder")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={importLoading}
            onClick={() => (importing ? onCancelImport() : onImportSkybox())}
          >
            {importLoading && <Loader2 className="size-4 animate-spin" />}
            {importing ? t("skys.import.cancel") : t("skys.import.button")}
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

      <Dialog open={showLevelPicker} onOpenChange={setShowLevelPicker}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("skys.import.selectLevel")}</DialogTitle>
          </DialogHeader>

          {importLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("skys.import.selectLevel")}
              </p>
              <RadioGroup
                value={selectedImportLevel?.toString() ?? ""}
                onValueChange={v => setSelectedImportLevel(Number(v))}
                className="flex flex-col gap-2"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <RadioGroupItem id={`lvl-${i}`} value={i.toString()} />
                    <Label htmlFor={`lvl-${i}`} className="text-sm">
                      {t("skys.levelName", { level: i })}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancelImport}>
                  {t("common.dialog.cancel")}
                </Button>
                <Button onClick={onSelectLevel}>
                  {t("common.dialog.confirm")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
