import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Folder,
  FolderInput,
  FolderPlus,
  Map as MapIcon,
  PenTool,
  Play,
  SearchX,
  Trash2
} from "lucide-react";
import { join, sep } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useT } from "@/i18n";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { launchMap } from "@/services/launcher";
import { confirmTasAutoplayOff } from "@/services/tasGuard";
import { importResources } from "@/services/resourceImport";
import { editMapInBlender } from "@/services/mapping";
import ListViewPage from "./components/ListViewPage";
import ResourceToolbar, { IconAction } from "./components/ResourceToolbar";
import {
  EmptyState,
  ExtTag,
  ResourceRow,
  RowAction
} from "./components/ResourceRow";
import { matchesQuery } from "@/utils/search";
import DirectoryTreeDialog from "./components/DirectoryTreeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** 搜索关键词：只在当前目录内过滤（不跳目录），切目录时清空 */
  const [query, setQuery] = useState("");

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

  /** 过滤后的列表；没输入关键词时就是整个目录 */
  const visibleList = useMemo(
    () => directoryList.filter(item => matchesQuery(item.name, query)),
    [directoryList, query]
  );
  const mapCount = visibleList.filter(i => !i.isDir).length;

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
    // 换了目录就把上一个目录的搜索词清掉（刷新同一目录时保留）
    if (fullPath !== currentPath) setQuery("");

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
    const { copied } = await importResources({
      title: t("resources.name.map"),
      native: ["cmo", "nmo"],
      targetDir: currentPath || rootPath
    });
    // BRP packages refresh the list themselves through the app store.
    if (copied) {
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
      void (async () => {
        // BallanceTAS 还开着「启动时自动播放」（TAS 编辑器留下的）就先问一句
        const instancePath = usePrefStore.getState().instancePath;
        if (instancePath && !(await confirmTasAutoplayOff(instancePath)))
          return;
        await launchMap([currentPath, item.name].join("/"));
      })().catch(() => {
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
        <div className="flex items-center gap-2">
          {breadcrumbItems.length > 0 && (
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbItems.map((item, idx) => (
                  <div key={idx} className="flex items-center">
                    <BreadcrumbItem>
                      <button
                        type="button"
                        className="cursor-pointer text-xs hover:text-primary"
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
          <span className="text-muted-foreground/50">·</span>
          <span>
            {t("resources.statistics.map", { cnt: mapCount }, mapCount)}
          </span>
        </div>
      }
      actions={
        <ResourceToolbar
          onImport={onImport}
          onRefresh={() => onRefresh(true)}
          onOpenFolder={onOpenFolder}
          search={{
            value: query,
            onChange: setQuery,
            placeholder: t("resources.search.placeholder")
          }}
          extra={
            <IconAction
              label={t("resources.createFolder.button")}
              onClick={() => {
                setNewFolderName("");
                setShowCreateFolderDialog(true);
              }}
            >
              <FolderPlus />
            </IconAction>
          }
        />
      }
    >
      {currentPath && currentPath !== rootPath && (
        <ResourceRow
          icon={<ArrowLeft />}
          iconClassName="bg-muted text-muted-foreground"
          title={t("resources.breadcrumb.backToParent")}
          onClick={() => loadDirectory(parentPath)}
        />
      )}

      {visibleList.length === 0 && (
        <EmptyState
          icon={query.trim() ? <SearchX /> : <MapIcon />}
          title={
            query.trim()
              ? t("resources.search.empty", { query: query.trim() })
              : t("resources.empty.map")
          }
        />
      )}

      {visibleList.map(item => {
        const disabled = !item.isDir && isFileDisabled(item.name);
        return (
          <ResourceRow
            key={item.name}
            icon={item.isDir ? <Folder /> : <MapIcon />}
            iconClassName={
              item.isDir
                ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                : undefined
            }
            dimmed={disabled}
            title={item.isDir ? item.name : getDisplayName(item.name)}
            meta={
              item.isDir ? (
                <span>{t("resources.folder.name")}</span>
              ) : (
                <>
                  <ExtTag>{getFileExtension(item.name)}</ExtTag>
                  <span className="tabular-nums">
                    {formatFileSize(item.size!)}
                  </span>
                </>
              )
            }
            onClick={() =>
              item.isDir ? loadDirectory(item.path) : confirmAndLaunch(item)
            }
            actions={
              <>
                {!item.isDir && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-1 text-success hover:bg-success/10 hover:text-success"
                    onClick={() => confirmAndLaunch(item)}
                  >
                    <Play className="size-4" />
                    {t("resources.launch.button")}
                  </Button>
                )}
                {!item.isDir && !isFileDisabled(item.name) && (
                  <RowAction
                    label={t("mapping.edit.button")}
                    onClick={() =>
                      void join(currentPath || rootPath, item.name).then(
                        editMapInBlender
                      )
                    }
                  >
                    <PenTool />
                  </RowAction>
                )}
                <RowAction
                  label={t("resources.move.button")}
                  onClick={() => onMoveFile(item)}
                >
                  <FolderInput />
                </RowAction>
                <RowAction
                  label={t("resources.delete.button")}
                  destructive
                  onClick={() => onDelete(item)}
                >
                  <Trash2 />
                </RowAction>
              </>
            }
          />
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
