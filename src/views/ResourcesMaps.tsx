import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Folder,
  FolderInput,
  Map as MapIcon,
  Play,
  Trash2
} from "lucide-react";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useT } from "@/i18n";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { launchMap } from "@/services/launcher";
import ListViewPage from "./components/ListViewPage";
import DirectoryTreeDialog from "./components/DirectoryTreeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

interface DirItem {
  name: string;
  size?: number;
  isDir: boolean;
  path: string; // relative path for dirs; "" for files
}

export default function ResourcesMaps() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const refreshKey = useAppStore(s => s.refreshKey);
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [directoryList, setDirectoryList] = useState<DirItem[]>([]);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [itemToMove, setItemToMove] = useState<DirItem | null>(null);

  const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");
  const getDisplayName = (fileName: string) =>
    isFileDisabled(fileName) ? fileName.replace(".disable", "") : fileName;
  const getFileExtension = (fileName: string) => {
    const name = getDisplayName(fileName);
    const parts = name.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "";
  };

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; path: string }[] = [
      { label: t("resources.breadcrumb.root"), path: "" }
    ];
    const relativePath = currentPath.replace(rootPath, "").trim();
    if (relativePath) {
      const parts = relativePath.split(/[\\/]/).filter(Boolean);
      let accumulated = "";
      for (const part of parts) {
        accumulated = accumulated ? `${accumulated}/${part}` : part;
        items.push({ label: part, path: accumulated });
      }
    }
    return items;
  }, [currentPath, rootPath, t]);

  const mapCount = directoryList.filter(i => !i.isDir).length;

  const parentPath = useMemo(() => {
    const relativePath = currentPath.replace(rootPath, "").trim();
    if (!relativePath) return "";
    const parts = relativePath.split(/[\\/]/).filter(Boolean);
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
  }, [currentPath, rootPath]);

  const loadDirectory = async (relativePath = "") => {
    if (!selectedInstanceData) return;
    const root = await join(selectedInstanceData.path, "ModLoader", "Maps");
    setRootPath(root);
    const fullPath = relativePath
      ? await join(root, relativePath.replace(/\//g, sep()))
      : root;
    setCurrentPath(fullPath);

    const dirs = await backend.listDirs(fullPath);
    const dirItems: DirItem[] = dirs.map(d => {
      const dirName = d.split(/[\\/]/).pop()!;
      return {
        name: dirName,
        isDir: true,
        path: relativePath ? `${relativePath}/${dirName}` : dirName
      };
    });

    const files = await backend.list(fullPath, ["cmo", "nmo"]);
    const fileItems: DirItem[] = files.map(f => ({
      name: f.name,
      size: f.size,
      isDir: false,
      path: ""
    }));

    const merged = [...dirItems, ...fileItems];
    merged.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return 0;
    });
    setDirectoryList(merged);
  };

  const onRefresh = async (showMessage = false) => {
    const relativePath = currentPath.replace(rootPath, "").trim();
    await loadDirectory(relativePath);
    if (showMessage) message.success(t("resources.refresh.success"));
  };

  const onImport = async () => {
    const files = await browseFile({
      title: t("resources.import.tip") + " " + t("resources.name.map"),
      multiple: true,
      filters: [{ name: t("resources.name.map"), extensions: ["cmo", "nmo"] }]
    });
    if (files && files.length) {
      const targetDir = currentPath || rootPath;
      for (const source of files as string[]) {
        const target = await join(targetDir, source.split(sep()).pop()!);
        await backend.copy(source, target);
      }
      await onRefresh();
      message.success(t("resources.import.success"));
    }
  };

  const onDelete = (item: DirItem) => {
    dialog.warning({
      title: t("common.message.warning"),
      content: t("resources.delete.message", { name: item.name }),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: async () => {
        const fullPath = await join(currentPath, item.name);
        if (item.isDir) await backend.remove_dir(fullPath);
        else await backend.delete(fullPath);
        await onRefresh();
        message.success(t("resources.delete.success"));
      }
    });
  };

  /** Launch a map file, optionally with a confirm dialog (skippable via pref). */
  const confirmAndLaunch = (item: DirItem) => {
    const launch = () => {
      void launchMap([currentPath, item.name].join("/")).catch(() => {
        message.error(t("resources.launch.error"));
      });
    };
    if (!usePrefStore.getState().confirmLaunchMap) {
      launch();
      return;
    }
    // Ponytail: closure-captured mutable variable shared between uncontrolled
    // checkbox and onPositiveClick. Avoids a state component for one boolean.
    let dontAskAgain = false;
    dialog.create({
      title: t("resources.launch.button"),
      content: () => (
        <div className="space-y-3">
          <p className="text-sm">
            {t("resources.launch.confirmMessage", {
              name: getDisplayName(item.name)
            })}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              onChange={e => {
                dontAskAgain = e.target.checked;
              }}
            />
            {t("resources.launch.dontAskAgain")}
          </label>
        </div>
      ),
      positiveText: t("resources.launch.button"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => {
        if (dontAskAgain) {
          usePrefStore.setState({ confirmLaunchMap: false });
        }
        launch();
      }
    });
  };

  const onOpenFolder = async () => {
    await backend.openInExplorer(currentPath || rootPath);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const targetDir = currentPath || rootPath;
      const folderPath = await join(targetDir, newFolderName.trim());
      await backend.mkdir(folderPath);
      message.success(t("resources.createFolder.success"));
      setShowCreateFolderDialog(false);
      await onRefresh();
    } catch {
      message.error(t("resources.createFolder.error"));
    }
  };

  const onMoveFile = (item: DirItem) => {
    setItemToMove(item);
    setShowMoveDialog(true);
  };

  const handleMoveFile = async (targetPath: string) => {
    if (!itemToMove) return;
    try {
      const sourcePath = itemToMove.isDir
        ? await join(rootPath, itemToMove.path)
        : await join(currentPath, itemToMove.name);
      const targetFilePath = await join(targetPath, itemToMove.name);
      await backend.rename(sourcePath, targetFilePath);
      message.success(t("resources.move.success"));
      setShowMoveDialog(false);
      setItemToMove(null);
      await onRefresh();
    } catch (error) {
      message.error(`${t("resources.move.error")}: ${error}`);
    }
  };

  useEffect(() => {
    void loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <ListViewPage
      title={
        <div className="flex items-center gap-3">
          {breadcrumbItems.length > 0 && (
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbItems.map((item, idx) => (
                  <div key={idx} className="flex items-center">
                    <BreadcrumbItem>
                      <button
                        type="button"
                        className="cursor-pointer text-sm hover:text-primary"
                        onClick={() => loadDirectory(item.path)}
                      >
                        {item.label}
                      </button>
                    </BreadcrumbItem>
                    {idx < breadcrumbItems.length - 1 && (
                      <BreadcrumbSeparator />
                    )}
                  </div>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <span className="text-sm">
            {t("resources.statistics.map", { cnt: mapCount }, mapCount)}
          </span>
        </div>
      }
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => onRefresh(true)}>
            {t("common.action.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewFolderName("");
              setShowCreateFolderDialog(true);
            }}
          >
            {t("resources.createFolder.button")}
          </Button>
          <Button variant="outline" size="sm" onClick={onImport}>
            {t("resources.import.button")}
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenFolder}>
            {t("common.action.openFolder")}
          </Button>
        </>
      }
    >
      {currentPath && currentPath !== rootPath && (
        <div
          className="flex cursor-pointer items-center gap-2 px-4 py-2.5 hover:bg-accent"
          onClick={() => loadDirectory(parentPath)}
        >
          <ArrowLeft className="size-4" />
          <span className="text-sm">
            {t("resources.breadcrumb.backToParent")}
          </span>
        </div>
      )}

      {directoryList.map(item => {
        const disabled = !item.isDir && isFileDisabled(item.name);
        return (
          <div
            key={item.name}
            className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
            onClick={() =>
              item.isDir
                ? loadDirectory(item.path)
                : confirmAndLaunch(item)
            }
          >
            {item.isDir ? (
              <Folder className="size-4 text-muted-foreground" />
            ) : (
              <MapIcon
                className={
                  "size-4 " + (disabled ? "text-muted-foreground/40" : "text-primary")
                }
              />
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={
                  "truncate text-sm " +
                  (disabled ? "line-through opacity-60" : "")
                }
              >
                {item.isDir ? item.name : getDisplayName(item.name)}
              </span>
              {!item.isDir ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {getFileExtension(item.name)}
                  </Badge>
                  <span>{formatFileSize(item.size!)}</span>
                </div>
              ) : (
                <Badge
                  variant="outline"
                  className="w-fit px-1.5 py-0 text-[10px]"
                >
                  {t("resources.folder.name")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!item.isDir && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-600 hover:text-emerald-700"
                  onClick={e => {
                    e.stopPropagation();
                    confirmAndLaunch(item);
                  }}
                >
                  <Play className="size-4" />
                  {t("resources.launch.button")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  onMoveFile(item);
                }}
              >
                <FolderInput className="size-4" />
                {t("resources.move.button")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(item);
                }}
              >
                <Trash2 className="size-4" />
                {t("resources.delete.button")}
              </Button>
            </div>
          </div>
        );
      })}

      <Dialog
        open={showCreateFolderDialog}
        onOpenChange={setShowCreateFolderDialog}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("resources.createFolder.title")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            placeholder={t("resources.createFolder.placeholder")}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateFolder();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateFolderDialog(false)}
            >
              {t("common.dialog.cancel")}
            </Button>
            <Button
              disabled={!newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
            >
              {t("common.dialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DirectoryTreeDialog
        show={showMoveDialog}
        rootPath={rootPath}
        currentPath={currentPath}
        itemToMovePath={itemToMove?.isDir ? itemToMove.path : undefined}
        onClose={() => setShowMoveDialog(false)}
        onConfirm={handleMoveFile}
      />
    </ListViewPage>
  );
}
