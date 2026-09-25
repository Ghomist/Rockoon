import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { importResources } from "@/services/resourceImport";
import ListViewPage from "./components/ListViewPage";
import ResourceToolbar from "./components/ResourceToolbar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

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

export default function ResourcesPageBase({ type }: Props) {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const refreshKey = useAppStore(s => s.refreshKey);
  const [rscPath, setRscPath] = useState("");
  const [rscList, setRscList] = useState<ManagedFile[]>([]);

  const schema = resourcePageSchema[type];
  const rscName = t("resources.name." + type);

  const isFileDisabled = (fileName: string) => fileName.endsWith(".disable");
  const getDisplayName = (fileName: string) =>
    isFileDisabled(fileName) ? fileName.replace(".disable", "") : fileName;
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

  return (
    <ListViewPage
      title={t(
        "resources.statistics." + type,
        { cnt: rscList.length },
        rscList.length
      )}
      actions={
        <ResourceToolbar
          onImport={onImport}
          onRefresh={() => onRefresh(true)}
          onOpenFolder={onOpenFolder}
        />
      }
    >
      {rscList.map(file => {
        const disabled = isFileDisabled(file.name);
        return (
          <div
            key={file.name}
            className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
            onClick={() => onToggleDisable(file, disabled)}
          >
            <Switch
              checked={!disabled}
              onClick={e => e.stopPropagation()}
              onCheckedChange={v => onToggleDisable(file, v)}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={
                  "truncate text-sm " +
                  (disabled ? "line-through opacity-60" : "")
                }
              >
                {getDisplayName(file.name)}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {getFileExtension(file.name)}
                </Badge>
                <span>{formatFileSize(file.size)}</span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
              onClick={e => {
                e.stopPropagation();
                onDelete(file);
              }}
            >
              <Trash2 className="size-4" />
              {t("resources.delete.button")}
            </Button>
          </div>
        );
      })}
    </ListViewPage>
  );
}
