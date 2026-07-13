import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { formatFileSize } from "@/utils/format";
import { dialog, message } from "@/utils/ui/feedback";
import { importFromFile } from "@/services/brp";
import ListViewPage from "./components/ListViewPage";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

type ResourceType = "map" | "mod";

type ResourceSchema = {
  filter: string[];
  targetPath: string[];
  listFiles?: (self: ResourceSchema) => Promise<ManagedFile[]>;
};

const resourcePageSchema: Record<ResourceType, ResourceSchema> = {
  map: { filter: ["cmo", "nmo"], targetPath: ["ModLoader", "Maps"] },
  mod: { filter: ["bmod", "bmodp", "zip"], targetPath: ["ModLoader", "Mods"] }
};

interface Props {
  type: ResourceType;
  onOpen?: (file: ManagedFile) => void;
  onBrpImported?: () => void;
}

export default function ResourcesPageBase({ type, onBrpImported }: Props) {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
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
    const list = schema.listFiles
      ? await schema.listFiles(schema)
      : await backend.list(path, schema.filter);
    setRscList(list);
    if (showMessage) message.success(t("resources.refresh.success"));
  };

  const onImport = async () => {
    const files = await browseFile({
      title: t("resources.import.tip") + " " + rscName,
      multiple: true,
      filters: [{ name: rscName, extensions: schema.filter }]
    });
    if (files && files.length) {
      for (const source of files as string[]) {
        const target = await join(rscPath, source.split(sep()).pop()!);
        await backend.copy(source, target);
      }
      await onRefresh();
      message.success(t("resources.import.success"));
    }
  };

  const onImportBrp = async () => {
    const files = await browseFile({
      title: t("brp.importButton"),
      multiple: true,
      filters: [{ name: "BRP", extensions: ["brp", "zip"] }]
    });
    if (!files || !files.length) return;
    let any = false;
    for (const f of files as string[]) {
      const result = await importFromFile(f);
      if (result) any = true;
    }
    if (any) {
      await onRefresh();
      onBrpImported?.();
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

  return (
    <ListViewPage
      title={t(
        "resources.statistics." + type,
        { cnt: rscList.length },
        rscList.length
      )}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => onRefresh(true)}>
            {t("common.action.refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={onImport}>
            {t("resources.import.button")}
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
