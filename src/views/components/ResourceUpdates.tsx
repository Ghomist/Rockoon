import { useEffect, useMemo } from "react";
import { CircleArrowUp, ExternalLink, LoaderCircle } from "lucide-react";

import backend from "@/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import {
  checkResourceUpdates,
  type HubMatch,
  resourceKey,
  type ResourceKind,
  type ResourceUpdate,
  selectUpdates,
  updateResources,
  useResourceUpdatesStore
} from "@/services/resourceUpdates";
import { hubUrl } from "@/services/hub";
import { useAppStore } from "@/stores/app";
import { dialog } from "@/utils/ui/feedback";
import { RowAction } from "./ResourceRow";

/** 进页面、页面刷新（导入 / 更新完）时查一次更新 */
export function useResourceUpdateCheck() {
  const instancePath = useAppStore(s => s.selectedInstanceData?.path);
  const refreshKey = useAppStore(s => s.refreshKey);
  useEffect(() => {
    if (instancePath) void checkResourceUpdates(instancePath);
  }, [instancePath, refreshKey]);
}

/** 这个文件在下载站上对应什么（查不到是 undefined） */
export function useHubMatch(path: string): HubMatch | undefined {
  return useResourceUpdatesStore(s => s.resources[resourceKey(path)]?.hub);
}

const authorNames = (hub: HubMatch) =>
  hub.package.authors
    .map(a => a.nickname || a.display.replace(/^@/, ""))
    .join("、");

/** 列表行元信息的后半段：作者、更新日期、版本，有新版时带一个标记 */
export function HubMeta({ path }: { path: string }) {
  const t = useT();
  const hub = useHubMatch(path);
  if (!hub) return null;
  const authors = authorNames(hub);
  return (
    <>
      {authors && <span className="truncate">{authors}</span>}
      {hub.latest_date && (
        <span className="shrink-0 tabular-nums">
          {t("resources.update.updatedAt", { date: hub.latest_date })}
        </span>
      )}
      <span className="shrink-0 tabular-nums">v{hub.version}</span>
      {hub.has_update && (
        <Badge className="h-4 shrink-0 px-1.5 text-[10px]">
          {t("resources.update.newVersion", { version: hub.latest_version })}
        </Badge>
      )}
    </>
  );
}

/** 这一行有新版时的「更新」按钮 */
export function RowUpdateButton({ path }: { path: string }) {
  const t = useT();
  const hub = useHubMatch(path);
  const updating = useResourceUpdatesStore(s => s.updating);
  const resources = useResourceUpdatesStore(s => s.resources);
  if (!hub?.has_update) return null;
  const onUpdate = () => {
    // 同一资源的几份文件是一次安装（没装加载器时 mod 两份产物都在）
    void updateResources(
      selectUpdates(resources).filter(u => u.hub.package.id === hub.package.id)
    );
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mr-1 text-primary hover:bg-primary/10 hover:text-primary"
      disabled={updating}
      onClick={onUpdate}
    >
      <CircleArrowUp className="size-4" />
      {t("resources.update.button")}
    </Button>
  );
}

/** 能反查到下载站资源时，给一个跳到资源详情页的入口；查不到的文件不显示 */
export function RowHubLink({ path }: { path: string }) {
  const t = useT();
  const hub = useHubMatch(path);
  if (!hub) return null;
  const onOpen = () => {
    void backend
      .open(hubUrl(`/resource/${hub.package.id}`))
      .catch(error => console.warn("Open resource page failed:", error));
  };
  return (
    <RowAction label={t("resources.update.openSite")} onClick={onOpen}>
      <ExternalLink />
    </RowAction>
  );
}

function confirmUpdateAll(
  updates: ResourceUpdate[],
  t: ReturnType<typeof useT>
) {
  dialog.create({
    title: t("resources.update.confirmTitle"),
    content: () => (
      <ul className="max-h-60 overflow-auto text-sm">
        {updates.map(u => (
          <li key={u.path} className="flex justify-between gap-3 py-0.5">
            <span className="truncate">
              {u.hub.package.name ?? u.hub.asset.name}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              v{u.hub.version} → v{u.hub.latest_version}
            </span>
          </li>
        ))}
      </ul>
    ),
    positiveText: t("resources.update.confirmAll"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      void updateResources(updates);
    }
  });
}

/** 页面右上角的更新按钮：有新版才出现，数量算的是整个实例（地图含子文件夹） */
export function UpdateAllButton({ kind }: { kind: ResourceKind }) {
  const t = useT();
  const resources = useResourceUpdatesStore(s => s.resources);
  const updating = useResourceUpdatesStore(s => s.updating);
  const updates = useMemo(
    () => selectUpdates(resources, kind),
    [resources, kind]
  );
  if (!updates.length) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="mr-1 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
      disabled={updating}
      onClick={() => confirmUpdateAll(updates, t)}
    >
      {updating ? <LoaderCircle className="animate-spin" /> : <CircleArrowUp />}
      {t("resources.update.all", { count: updates.length })}
    </Button>
  );
}
