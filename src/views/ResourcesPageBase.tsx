import { useEffect, useMemo, useState } from "react";
import {
  FileCog,
  Map as MapIcon,
  Puzzle,
  SearchX,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { formatFileSize } from "@/utils/format";
import { matchesQuery } from "@/utils/search";
import { dialog, message } from "@/utils/ui/feedback";
import { importResources } from "@/services/resourceImport";
import ListViewPage from "./components/ListViewPage";
import ResourceToolbar from "./components/ResourceToolbar";
import ModConfigSheet, { modNameOf } from "./components/ModConfigSheet";
import {
  EmptyState,
  ExtTag,
  ResourceRow,
  RowAction
} from "./components/ResourceRow";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type ResourceType = "map" | "mod";

type ResourceSchema = {
  /** Formats this page imports as-is; brp/zip packages are always accepted. */
  filter: string[];
  targetPath: string[];
};

const resourcePageSchema: Record<ResourceType, ResourceSchema> = {
  map: { filter: ["cmo", "nmo"], targetPath: ["ModLoader", "Maps"] },
  mod: { filter: ["bmod", "bmodp", "zip"], targetPath: ["ModLoader", "Mods"] }
};

interface Props {
  type: ResourceType;
}

/** 配置文件名 → 比较用的基名（去掉扩展名，小写） */
const modConfigBase = (fileName: string) =>
  fileName.replace(/\.(cfg|ini)$/i, "").toLowerCase();

export default function ResourcesPageBase({ type }: Props) {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const refreshKey = useAppStore(s => s.refreshKey);
  const [rscPath, setRscPath] = useState("");
  const [rscList, setRscList] = useState<ManagedFile[]>([]);
  const [query, setQuery] = useState("");
  /** mod 页专用：ModLoader/Configs 里的配置文件名（给「配置」按钮找目标） */
  const [configNames, setConfigNames] = useState<string[]>([]);
  /** 正在编辑的配置文件名（右侧抽屉） */
  const [editing, setEditing] = useState<string | null>(null);

  const schema = resourcePageSchema[type];
  const TypeIcon = type === "map" ? MapIcon : Puzzle;
  const rscName = t("resources.name." + type);

  const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");
  const getDisplayName = (fileName: string) =>
    isFileDisabled(fileName) ? fileName.replace(".disable", "") : fileName;

  /**
   * 这个 mod 有没有配置文件？按「去掉扩展名后的名字」匹配（CameraUtilities.bmodp
   * ↔ CameraUtilities.cfg，GoldenMode/ ↔ GoldenMode.cfg），没配置的就不给入口。
   */
  const configFor = (fileName: string) => {
    const base = getDisplayName(fileName)
      .replace(/\.[^.]+$/, "")
      .toLowerCase();
    return configNames.find(name => modConfigBase(name) === base);
  };
  const getFileExtension = (fileName: string) => {
    const name = getDisplayName(fileName);
    const parts = name.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "";
  };

  const onRefresh = async (showMessage = false) => {
    if (!selectedInstanceData) return;
    const path = await join(selectedInstanceData.path, ...schema.targetPath);
    setRscPath(path);
    const list = await backend.list(path, schema.filter);
    setRscList(list);
    if (type === "mod") {
      // 顺手读一下配置文件列表：有配置的 mod 才能在行尾给个「配置」入口
      try {
        const cfgDir = await join(
          selectedInstanceData.path,
          "ModLoader",
          "Configs"
        );
        const files = await backend.list(cfgDir, ["cfg", "ini"]);
        setConfigNames(files.map(f => f.name));
      } catch {
        setConfigNames([]);
      }
    }
    if (showMessage) message.success(t("resources.refresh.success"));
  };

  const onImport = async () => {
    const { copied } = await importResources({
      title: rscName,
      native: schema.filter,
      targetDir: rscPath
    });
    // BRP packages refresh the list themselves through the app store.
    if (copied) {
      await onRefresh();
      message.success(t("resources.import.success"));
    }
  };

  const onDelete = async (file: ManagedFile) => {
    dialog.warning({
      title: t("common.message.warning"),
      content: t("resources.delete.message", {
        name: getDisplayName(file.name)
      }),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: async () => {
        await backend.delete(await join(rscPath, file.name));
        await onRefresh();
        message.success(t("resources.delete.success"));
      }
    });
  };

  const onToggleDisable = async (file: ManagedFile, newValue?: boolean) => {
    const shouldEnable =
      newValue !== undefined ? newValue : isFileDisabled(file.name);
    try {
      if (shouldEnable) {
        await backend.enable(rscPath, file.name);
        message.success(t("resources.enable.success"));
      } else {
        await backend.disable(rscPath, file.name);
        message.success(t("resources.disable.success"));
      }
      await onRefresh();
    } catch {
      message.error(t("resources.toggle.error"));
    }
  };

  const onOpenFolder = async () => {
    await backend.openInExplorer(rscPath);
  };

  useEffect(() => {
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  /** 搜索只过滤当前列表，不碰磁盘 */
  const visibleList = useMemo(
    () =>
      rscList.filter(file => matchesQuery(getDisplayName(file.name), query)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rscList, query]
  );

  /** 有配置、但列表里找不到对应 mod 的配置文件（搜索时按名字过滤） */
  const orphanConfigs = useMemo(() => {
    if (type !== "mod") return [];
    const used = new Set(rscList.map(f => configFor(f.name)));
    return configNames
      .filter(name => !used.has(name) && matchesQuery(modNameOf(name), query))
      .sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, rscList, configNames, query]);

  return (
    <ListViewPage
      title={t(
        "resources.statistics." + type,
        { cnt: visibleList.length },
        visibleList.length
      )}
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
        />
      }
    >
      {visibleList.length === 0 && orphanConfigs.length === 0 && (
        <EmptyState
          icon={query.trim() ? <SearchX /> : <TypeIcon />}
          title={
            query.trim()
              ? t("resources.search.empty", { query: query.trim() })
              : t("resources.empty." + type)
          }
        />
      )}

      {visibleList.map(file => {
        const disabled = isFileDisabled(file.name);
        const config = type === "mod" ? configFor(file.name) : undefined;
        return (
          <ResourceRow
            key={file.name}
            leading={
              <Switch
                checked={!disabled}
                onCheckedChange={v => onToggleDisable(file, v)}
              />
            }
            icon={<TypeIcon />}
            dimmed={disabled}
            title={getDisplayName(file.name)}
            meta={
              <>
                <ExtTag>{getFileExtension(file.name)}</ExtTag>
                <span className="tabular-nums">
                  {formatFileSize(file.size)}
                </span>
              </>
            }
            onClick={() => onToggleDisable(file, disabled)}
            actions={
              <>
                {config && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-1"
                    onClick={() => setEditing(config)}
                  >
                    <SlidersHorizontal className="size-4" />
                    {t("resources.config.button")}
                  </Button>
                )}
                <RowAction
                  label={t("resources.delete.button")}
                  destructive
                  onClick={() => onDelete(file)}
                >
                  <Trash2 />
                </RowAction>
              </>
            }
          />
        );
      })}

      {/* 没对应 mod 文件的配置（BML.cfg 这类加载器自己的、或 mod 已删），单列出来 */}
      {orphanConfigs.length > 0 && (
        <div className="px-5 pt-4 pb-1 text-xs font-medium text-muted-foreground">
          {t("modConfigs.other")}
        </div>
      )}
      {orphanConfigs.map(name => (
        <ResourceRow
          key={`cfg:${name}`}
          icon={<FileCog />}
          iconClassName="bg-muted text-muted-foreground"
          title={modNameOf(name)}
          meta={<ExtTag>{name.split(".").pop()?.toUpperCase()}</ExtTag>}
          onClick={() => setEditing(name)}
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="mr-1"
              onClick={() => setEditing(name)}
            >
              <SlidersHorizontal className="size-4" />
              {t("resources.config.button")}
            </Button>
          }
        />
      ))}

      {type === "mod" && selectedInstanceData && (
        <ModConfigSheet
          instancePath={selectedInstanceData.path}
          file={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </ListViewPage>
  );
}
