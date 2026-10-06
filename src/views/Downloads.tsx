import {
  ArrowDownToLine,
  ArrowUpCircle,
  CheckCircle2,
  Gamepad2,
  Package,
  Wrench,
  X,
  XCircle
} from "lucide-react";

import ListViewPage from "@/views/components/ListViewPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n";
import {
  useDownloadsStore,
  type DownloadKind,
  type DownloadStatus,
  type DownloadTask
} from "@/stores/downloads";
import { formatBytes } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * 下载任务页。
 *
 * 所有下载都在后台跑，这里只是它们的列表：进行中的显示进度、大小、速度并可取消，
 * 结束后留在列表里（可重试 / 移除），或者用「清空已完成」一次清掉。
 * 任务只存在内存里 —— 关掉启动器就没了，因为下载本身也会随之结束。
 */

const KIND_ICON: Record<DownloadKind, typeof Package> = {
  brp: Package,
  game: Gamepad2,
  patch: Wrench,
  update: ArrowUpCircle
};

const KIND_TINT: Record<DownloadKind, string> = {
  brp: "bg-primary/10 text-primary",
  game: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  patch: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  update: "bg-amber-500/12 text-amber-600 dark:text-amber-400"
};

const STATUS_CLASS: Record<DownloadStatus, string> = {
  running: "border-transparent bg-secondary text-secondary-foreground",
  success:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-border text-muted-foreground"
};

function statusText(t: ReturnType<typeof useT>, status: DownloadStatus) {
  return t(`downloads.status.${status}`);
}

function phaseText(t: ReturnType<typeof useT>, task: DownloadTask) {
  return t(`downloads.phase.${task.phase}`);
}

/** 进行中的一行：进度条 + 百分比 · 大小 · 速度 */
function RunningDetail({ task }: { task: DownloadTask }) {
  const t = useT();
  return (
    <div className="mt-2 space-y-1.5">
      <Progress value={task.percent} className="h-1.5" />
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{phaseText(t, task)}</span>
        <span className="tabular-nums">{task.percent}%</span>
        {task.total > 0 && (
          <span className="tabular-nums">
            {formatBytes(task.downloaded)} / {formatBytes(task.total)}
          </span>
        )}
        {task.speed > 0 && (
          <span className="tabular-nums">{formatBytes(task.speed)}/s</span>
        )}
        {!task.cancellable && <span>{t("downloads.noCancel")}</span>}
      </p>
    </div>
  );
}

function TaskRow({ task }: { task: DownloadTask }) {
  const t = useT();
  const cancel = useDownloadsStore(s => s.cancel);
  const remove = useDownloadsStore(s => s.remove);
  const Icon = KIND_ICON[task.kind];
  const running = task.status === "running";

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
          KIND_TINT[task.kind]
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <Badge
            variant="outline"
            className={cn("shrink-0", STATUS_CLASS[task.status])}
          >
            {task.status === "success" && (
              <CheckCircle2 className="mr-0.5 size-3" />
            )}
            {task.status === "error" && <XCircle className="mr-0.5 size-3" />}
            {statusText(t, task.status)}
          </Badge>
        </div>

        {task.target && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("downloads.target", { target: task.target })}
          </p>
        )}

        {running ? (
          <RunningDetail task={task} />
        ) : (
          task.error && (
            <p className="mt-1 text-xs break-all text-destructive">
              {task.error}
            </p>
          )
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        {running && task.cancellable && (
          <Button variant="outline" size="sm" onClick={() => void cancel(task.id)}>
            {t("downloads.cancel")}
          </Button>
        )}
        {!running && task.status !== "success" && task.retry && (
          <Button variant="outline" size="sm" onClick={() => task.retry?.()}>
            {t("downloads.retry")}
          </Button>
        )}
        {!running && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("downloads.remove")}
            onClick={() => remove(task.id)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Downloads() {
  const t = useT();
  const tasks = useDownloadsStore(s => s.tasks);
  const clearFinished = useDownloadsStore(s => s.clearFinished);

  const running = tasks
    .filter(x => x.status === "running")
    .sort((a, b) => a.createdAt - b.createdAt);
  const finished = tasks
    .filter(x => x.status !== "running")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const ordered = [...running, ...finished];

  return (
    <ListViewPage
      title={
        <span className="flex items-center gap-2">
          <ArrowDownToLine className="size-4" />
          {t("downloads.title")}
          {running.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {t("downloads.runningCount", { count: running.length })}
            </span>
          )}
        </span>
      }
      actions={
        finished.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            {t("downloads.clearFinished")}
          </Button>
        )
      }
    >
      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-24 text-center">
          <ArrowDownToLine className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">{t("downloads.empty")}</p>
          <p className="max-w-md text-xs text-muted-foreground">
            {t("downloads.emptyHint")}
          </p>
        </div>
      ) : (
        ordered.map(task => <TaskRow key={task.id} task={task} />)
      )}
    </ListViewPage>
  );
}
