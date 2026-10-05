import { useCallback, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import backend from "@/backend";
import { useT } from "@/i18n";
import { hubUrl } from "@/services/hub";
import {
  DEFAULT_PLAYER_KEY,
  detectInstalled,
  fetchPatches,
  fetchPatchVersions,
  findConflicts,
  installPatch,
  installedPlayerBuild,
  isPlayerPatch,
  isSecondaryPlayer,
  mutexGroupOf,
  resolveConflicts,
  type PatchInstallTarget
} from "@/services/patches";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
import { message } from "@/utils/ui/feedback";
import { formatFileSize } from "@/utils/format";
import type { ImportPhase } from "@/components/ImportProgressDialog";
import ImportProgressDialog from "@/components/ImportProgressDialog";
import ListViewPage from "@/views/components/ListViewPage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

/**
 * 补丁页：BML / BML+ / 新 Player 的安装、更新与版本回退。
 *
 * 补丁清单与安装提示都来自下载站（GET /patches），这里只负责把文件装到
 * 正确的位置（游戏根或 Bin）并记下版本号。没选游戏时提示去选一个。
 *
 * 「新 Player」的两种构建（vc6 / msvc2022）产出的文件完全一样，所以合并成一项：
 * 列表里只出现一次，默认装主构建（vc6），想装另一种去「选择版本」里挑。
 */

/** 版本列表里的一项：带上它属于哪个构建（只有 Player 需要） */
type PickerItem = PatchVersion & { build?: PatchComponent };
export default function Patches() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [components, setComponents] = useState<PatchComponent[]>([]);
  const [installed, setInstalled] = useState<Record<string, string | null>>({});
  const [busyKey, setBusyKey] = useState("");
  const [picker, setPicker] = useState<PatchComponent | null>(null);
  const [versions, setVersions] = useState<PickerItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [progress, setProgress] = useState<{
    open: boolean;
    phase: ImportPhase;
    percent: number;
    error: string;
    resultText: string;
  }>({
    open: false,
    phase: "connecting",
    percent: 0,
    error: "",
    resultText: ""
  });
  /** 待确认的互斥安装：同组的另一个补丁还装着 */
  const [pendingConflict, setPendingConflict] = useState<{
    component: PatchComponent;
    items: PatchComponent[];
    target: PatchInstallTarget;
  } | null>(null);
  const taskId = useRef("");

  const refresh = useCallback(async (instancePath: string) => {
    try {
      const list = await fetchPatches();
      setComponents(list);
      const state: Record<string, string | null> = {};
      for (const component of list) {
        state[component.key] = await detectInstalled(component, instancePath);
      }
      setInstalled(state);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const instance = useWaitForSelectedInstance(data => refresh(data.path));

  /** 打开版本列表；Player 会把两种构建的版本合在一起展示 */
  const openPicker = async (
    component: PatchComponent,
    extras: PatchComponent[] = []
  ) => {
    setPicker(component);
    setVersions([]);
    setVersionsLoading(true);
    try {
      const groups = [component, ...extras];
      const lists = await Promise.all(
        groups.map(async c => {
          if (!c.package_id) return [] as PickerItem[];
          const items = await fetchPatchVersions(c.package_id);
          return items.map(item => ({ ...item, build: c }));
        })
      );
      // 两种构建的版本号是各自的文件序号，没法比大小 —— 按发布时间排
      setVersions(
        lists.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setVersionsLoading(false);
    }
  };

  const doInstall = async (
    component: PatchComponent,
    target: { version: number; tag: string } | null
  ) => {
    if (!instance) return;
    setPicker(null);
    setBusyKey(component.key);
    setProgress({
      open: true,
      phase: "connecting",
      percent: 0,
      error: "",
      resultText: ""
    });
    try {
      await installPatch(component, instance.path, target, {
        onPhase: phase => setProgress(s => ({ ...s, phase })),
        onPercent: percent => setProgress(s => ({ ...s, percent })),
        onTaskId: id => {
          taskId.current = id;
        }
      });
      const done = target?.tag ?? component.latest;
      setProgress(s => ({
        ...s,
        phase: "done",
        percent: 100,
        resultText: t("patches.installDone", {
          name: component.name,
          version: done
        })
      }));
      await refresh(instance.path);
    } catch (e) {
      setProgress(s => ({
        ...s,
        error: e instanceof Error ? e.message : String(e)
      }));
    } finally {
      setBusyKey("");
    }
  };

  /**
   * 安装入口：同组（BML / BML+，或两种 Player 构建）里已经有别的补丁装着时，
   * 先弹确认，确认后禁用旧的再装新的 —— 两个加载器同时存在会互相抢注入，
   * 两种 Player 构建装的是同一批文件。
   */
  const requestInstall = async (
    component: PatchComponent,
    target: PatchInstallTarget
  ) => {
    if (!instance) return;

    let items: PatchComponent[] = [];
    try {
      items = await findConflicts(component, instance.path, components);
    } catch (e) {
      // 检测失败不拦着安装，只是少了那层提醒
      console.warn("Conflict detection failed:", e);
    }

    if (items.length === 0) {
      await doInstall(component, target);
      return;
    }

    setPicker(null);
    setPendingConflict({ component, items, target });
  };

  /** 确认互斥处理：禁用冲突补丁（可逆）后继续安装 */
  const confirmConflict = async () => {
    const pending = pendingConflict;
    if (!pending || !instance) return;
    setPendingConflict(null);

    try {
      const handled = await resolveConflicts(instance.path, pending.items);
      if (handled.length > 0) {
        message.success(
          t("patches.conflictResolved", {
            names: handled.map(c => c.name).join(" / ")
          })
        );
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }

    await doInstall(pending.component, pending.target);
  };

  /** 新 Player 两种构建的名字（合并展示时用，下载站的组件名带版本细节） */
  const buildLabel = (key: string) =>
    key === DEFAULT_PLAYER_KEY ? t("patches.buildVc6") : t("patches.buildMsvc");

  const statusOf = (component: PatchComponent) => {
    const version = installed[component.key];
    if (version === null)
      return { label: t("patches.notInstalled"), tone: "muted" as const };
    if (version === "")
      return { label: t("patches.installedUnknown"), tone: "muted" as const };
    if (component.latest && version === component.latest) {
      return {
        label: t("patches.installed", { version }),
        tone: "ok" as const
      };
    }
    return {
      label: t("patches.installedOld", { version }),
      tone: "warn" as const
    };
  };

  return (
    <ListViewPage
      title={t("menu.patches")}
      actions={
        <Button
          variant="ghost"
          size="sm"
          disabled={!instance || loading}
          onClick={() => instance && void refresh(instance.path)}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          {t("patches.refresh")}
        </Button>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("patches.loading")}
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-6 text-sm text-destructive">
          {t("patches.loadFailed", { error })}
        </div>
      )}

      {!loading &&
        !error &&
        components
          .filter(c => !isSecondaryPlayer(c.key))
          .map(component => {
            const status = statusOf(component);
            const busy = busyKey === component.key;
            // 新 Player：两种构建合并展示，装过的话把构建也标出来（分不清就不标）
            const playerBuild =
              isPlayerPatch(component.key) && installed[component.key] !== null
                ? installedPlayerBuild()
                : undefined;
            const statusLabel = playerBuild
              ? `${status.label} · ${buildLabel(playerBuild)}`
              : status.label;
            const outdated =
              component.latest &&
              status.tone !== "ok" &&
              installed[component.key] !== null;
            // 同组里装着的其它补丁（安装会被禁用/覆盖，提前说一声）
            const group = mutexGroupOf(component.key);
            const conflicting =
              group === undefined
                ? []
                : components.filter(
                    c =>
                      c.key !== component.key &&
                      mutexGroupOf(c.key) === group &&
                      typeof installed[c.key] === "string"
                  );
            return (
              <div
                key={component.key}
                className="flex flex-col gap-2 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {isPlayerPatch(component.key)
                      ? t("patches.newPlayer")
                      : component.name}
                  </span>
                  {component.latest && (
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {component.latest}
                    </Badge>
                  )}
                  <Badge
                    variant={status.tone === "ok" ? "secondary" : "outline"}
                    className={
                      status.tone === "warn"
                        ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
                        : status.tone === "muted"
                          ? "text-muted-foreground"
                          : ""
                    }
                  >
                    {statusLabel}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {component.install_target === "bin"
                    ? t("patches.targetBin")
                    : t("patches.targetGame")}
                  {" · "}
                  <button
                    type="button"
                    className="underline decoration-dotted hover:text-foreground"
                    onClick={() =>
                      void backend.open(
                        hubUrl(`/resource/${component.package_id}`)
                      )
                    }
                  >
                    {t("patches.openSite")}
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className="underline decoration-dotted hover:text-foreground"
                    onClick={() => void backend.open(component.homepage)}
                  >
                    {t("patches.openUpstream")}
                  </button>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!instance || busy || !component.package_id}
                    onClick={() => void requestInstall(component, null)}
                  >
                    {busy ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-4 w-4" />
                    )}
                    {outdated && component.latest
                      ? t("patches.updateTo", { version: component.latest })
                      : t("patches.installLatest")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !instance ||
                      busy ||
                      !component.package_id ||
                      !component.versions
                    }
                    onClick={() =>
                      void openPicker(
                        component,
                        isPlayerPatch(component.key)
                          ? components.filter(c => isSecondaryPlayer(c.key))
                          : []
                      )
                    }
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    {t("patches.chooseVersion")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t("patches.versionCount", { count: component.versions })}
                  </span>
                </div>

                {isPlayerPatch(component.key) && (
                  <p className="text-xs text-muted-foreground">
                    {t("patches.defaultBuildHint")}
                  </p>
                )}

                {conflicting.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("patches.conflictHintDisable", {
                      names: conflicting.map(c => c.name).join(" / ")
                    })}
                  </p>
                )}
              </div>
            );
          })}

      {/* 版本选择 / 回退 */}
      <Dialog open={!!picker} onOpenChange={v => !v && setPicker(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("patches.versionsTitle", { name: picker?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          {versionsLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("patches.loading")}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <div className="divide-y">
                {versions.map(item => {
                  // 展示用上游版本号（note），下载/删除用文件序号（version）
                  const tag = item.note || `v${item.version}`;
                  const isInstalled = picker
                    ? installed[picker.key] === tag
                    : false;
                  return (
                    <div
                      key={item.version}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{tag}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            #{item.version}
                          </span>
                          {item.build && (
                            <Badge variant="outline" className="text-[11px]">
                              {buildLabel(item.build.key)}
                            </Badge>
                          )}
                          {item.is_current && (
                            <Badge variant="outline" className="text-[11px]">
                              {t("patches.latestTag")}
                            </Badge>
                          )}
                          {isInstalled && (
                            <Badge variant="secondary" className="text-[11px]">
                              {t("patches.installedTag")}
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatFileSize(item.file_size)}
                          {" · "}
                          {new Date(item.created_at).toLocaleDateString()}
                          {" · "}
                          <span className="font-mono">{item.file_name}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyKey === picker?.key}
                        onClick={() =>
                          picker &&
                          void requestInstall(item.build ?? picker, {
                            version: item.version,
                            tag
                          })
                        }
                      >
                        {t("patches.installThis")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("patches.rollbackHint")}
          </p>
        </DialogContent>
      </Dialog>

      {/* 互斥确认：同组的另一个补丁要先禁用（或会被覆盖） */}
      <AlertDialog
        open={!!pendingConflict}
        onOpenChange={v => !v && setPendingConflict(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("patches.conflictTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("patches.conflictBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingConflict && (
            <div className="space-y-2 text-sm">
              <p className="font-medium">
                {t("patches.conflictWillDisable", {
                  names: pendingConflict.items.map(c => c.name).join(" / ")
                })}
              </p>
              <p className="text-muted-foreground">
                {t("patches.conflictAfter", {
                  name: pendingConflict.component.name
                })}
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t("patches.conflictCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmConflict()}>
              {t("patches.conflictConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportProgressDialog
        open={progress.open}
        phase={progress.phase}
        percent={progress.percent}
        error={progress.error}
        resultText={progress.resultText}
        labels={{
          connecting: t("patches.connecting"),
          downloading: t("patches.downloading"),
          importing: t("patches.extracting"),
          done: t("patches.done")
        }}
        onCancel={() => {
          if (taskId.current) void backend.cancelInstall(taskId.current);
        }}
        onClose={() =>
          setProgress(s => ({ ...s, open: false, error: "", resultText: "" }))
        }
      />
    </ListViewPage>
  );
}
