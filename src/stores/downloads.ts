import { create } from "zustand";

import backend from "@/backend";

/**
 * 下载任务中枢。
 *
 * 以前每个下载入口各自弹一个进度弹窗（而且锁死不能关），多任务会互相顶掉、
 * 也无法统一去重。现在所有下载（下载站资源、补丁、原版游戏、启动器自更新）
 * 都登记成这里的任务，界面统一由「下载任务」页展示，常态下只在开始时弹一条
 * message，完成后自动导入并再弹一条。
 *
 * 去重规则：同一个 `key` 只允许有一个「进行中」的任务，重复登记会把已有任务
 * 返回给调用方（duplicate=true），不会重复下载。
 */

export type DownloadKind = "brp" | "game" | "patch" | "update";
export type DownloadStatus = "running" | "success" | "error" | "cancelled";
/** 下载阶段，与后端事件里的阶段一一对应 */
export type DownloadPhase = "connecting" | "downloading" | "importing" | "done";

export interface DownloadTask {
  /** 后端任务 id（自更新没有后端任务，用生成的 id） */
  id: string;
  /** 去重键 */
  key: string;
  kind: DownloadKind;
  /** 列表主标题，例如「谜雾 · 地图」 */
  title: string;
  /** 目标说明：实例名或目录 */
  target?: string;
  status: DownloadStatus;
  phase: DownloadPhase;
  downloaded: number;
  total: number;
  percent: number;
  /** 字节/秒（采样 + 平滑） */
  speed: number;
  error?: string;
  /** 启动器自更新没有取消接口，这里是 false */
  cancellable: boolean;
  createdAt: number;
  finishedAt?: number;
  /** 失败或取消后点「重试」要重跑的东西 */
  retry?: () => void;
}

export interface BeginDownloadInput {
  id: string;
  key: string;
  kind: DownloadKind;
  title: string;
  target?: string;
  total?: number;
  cancellable?: boolean;
  retry?: () => void;
}

interface DownloadsState {
  tasks: DownloadTask[];
  /** 登记任务；同 key 有任务在跑就直接返回它 */
  begin: (
    input: BeginDownloadInput
  ) => { task: DownloadTask; duplicate: boolean };
  update: (id: string, patch: Partial<DownloadTask>) => void;
  /** 记录进度：自动算百分比与速度 */
  progress: (id: string, downloaded: number, total?: number) => void;
  succeed: (id: string, patch?: Partial<DownloadTask>) => void;
  fail: (id: string, error: string) => void;
  markCancelled: (id: string) => void;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => void;
  clearFinished: () => void;
  findByKey: (key: string) => DownloadTask | undefined;
}

/** 速度采样：攒够 400ms 才算一次，再做 0.6/0.4 平滑，否则小包会跳动 */
const samples = new Map<string, { at: number; bytes: number; speed: number }>();

function sampleSpeed(id: string, downloaded: number): number {
  const now = Date.now();
  const prev = samples.get(id);
  if (!prev) {
    samples.set(id, { at: now, bytes: downloaded, speed: 0 });
    return 0;
  }
  const dt = now - prev.at;
  if (dt < 400) return prev.speed;
  const instant = Math.max(0, ((downloaded - prev.bytes) / dt) * 1000);
  const speed = prev.speed > 0 ? prev.speed * 0.6 + instant * 0.4 : instant;
  samples.set(id, { at: now, bytes: downloaded, speed });
  return speed;
}

const isFinished = (status: DownloadStatus) => status !== "running";

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  tasks: [],

  begin: input => {
    const existing = get().tasks.find(
      t => t.key === input.key && t.status === "running"
    );
    if (existing) return { task: existing, duplicate: true };

    const task: DownloadTask = {
      id: input.id,
      key: input.key,
      kind: input.kind,
      title: input.title,
      target: input.target,
      status: "running",
      phase: "connecting",
      downloaded: 0,
      total: input.total ?? 0,
      percent: 0,
      speed: 0,
      cancellable: input.cancellable ?? true,
      createdAt: Date.now(),
      retry: input.retry
    };
    samples.delete(task.id);
    set(state => ({ tasks: [...state.tasks, task] }));
    return { task, duplicate: false };
  },

  update: (id, patch) =>
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && !isFinished(t.status) ? { ...t, ...patch } : t
      )
    })),

  progress: (id, downloaded, total) => {
    const speed = sampleSpeed(id, downloaded);
    set(state => ({
      tasks: state.tasks.map(t => {
        if (t.id !== id || t.status !== "running") return t;
        const size = total ?? t.total;
        return {
          ...t,
          downloaded,
          total: size,
          speed: speed || t.speed,
          percent:
            size > 0 ? Math.min(100, Math.round((downloaded / size) * 100)) : 0,
          phase: "downloading"
        };
      })
    }));
  },

  succeed: (id, patch) => {
    samples.delete(id);
    set(state => ({
      tasks: state.tasks.map(t =>
        // 已被取消的任务不要翻回成功：取消标记是用户刚点下的，得算数
        t.id === id && t.status === "running"
          ? {
              ...t,
              ...patch,
              status: "success",
              phase: "done",
              percent: 100,
              speed: 0,
              finishedAt: Date.now()
            }
          : t
      )
    }));
  },

  fail: (id, error) => {
    samples.delete(id);
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && t.status === "running"
          ? { ...t, status: "error", error, speed: 0, finishedAt: Date.now() }
          : t
      )
    }));
  },

  markCancelled: id => {
    samples.delete(id);
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && t.status === "running"
          ? {
              ...t,
              status: "cancelled",
              speed: 0,
              finishedAt: Date.now()
            }
          : t
      )
    }));
  },

  cancel: async id => {
    const task = get().tasks.find(t => t.id === id);
    if (!task || task.status !== "running") return;
    try {
      // 自更新走 tauri 更新插件，插件没有取消接口 —— 只能等它下完
      if (task.kind === "brp") await backend.cancelBrpImport(id);
      else if (task.kind === "game" || task.kind === "patch")
        await backend.cancelInstall(id);
    } finally {
      get().markCancelled(id);
    }
  },

  remove: id => {
    samples.delete(id);
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
  },

  clearFinished: () =>
    set(state => ({ tasks: state.tasks.filter(t => t.status === "running") })),

  findByKey: key => get().tasks.find(t => t.key === key)
}));
