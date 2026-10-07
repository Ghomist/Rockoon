import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  FileClock,
  Keyboard,
  Loader2,
  Maximize2,
  Redo2,
  RefreshCw,
  Save,
  Scissors,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TitleBarControls from "@/components/TitleBarControls";
import backend from "@/backend";
import { t } from "@/i18n";
import { usePrefStore } from "@/stores/pref";
import { useDarkMode } from "@/utils/theme";
import {
  DEFAULT_DELTA_MS,
  KEY_META,
  parseTas,
  recordKeyFor,
  writeTas,
  type TasFile,
  type TasKey
} from "@/tas/format";
import {
  clearRange,
  copyRange,
  coverRange,
  createUndoStack,
  pasteClip,
  setFrameDuration,
  shiftRange,
  trimTail,
  type TasClip,
  type TasSelection,
  type UndoEntry
} from "@/tas/editing";
import { DEFAULT_TAS_PREFS, loadTasPrefs, saveTasPrefs, type TasEditorPrefs } from "@/tas/prefs";
import { trackColor } from "@/tas/render";
import { paintableFrames } from "@/tas/viewport";
import TasTimeline, { type OpHandle, type TasTimelineHandle } from "./TasTimeline";
import TasHintBar from "./TasHints";

type ManagedFile = { name: string; size: number };
type Doc = { path: string; name: string; tas: TasFile };

/** 常用帧率（帧时长预设按钮）。 */
const FPS_PRESETS = [264, 240, 132, 120, 60, 30];

/** 焦点在输入框（或弹窗）里时别抢键盘（帧时长输入框要用 W/S/A/D 打字）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.closest('[role="dialog"]')) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const msToText = (ms: number) => String(Math.round(ms * 1000) / 1000);

/**
 * TAS 编辑器（独立窗口）。
 *
 * 职责：文件列表 / 打开保存 / 撤销重做栈 / 剪贴板 / 快捷键 / 工具栏。
 * 渲染与指针交互都在 `TasTimeline`（canvas）里。
 */
export default function TasEditorWindow() {
  const dark = useDarkMode();

  const instancePath = usePrefStore(s => s.instancePath);
  const tasDir = instancePath ? `${instancePath}/ModLoader/TASRecords` : "";

  const initialPrefs = useMemo(() => loadTasPrefs(), []);

  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [prefs, setPrefs] = useState<TasEditorPrefs>(initialPrefs);
  const [order, setOrder] = useState<TasKey[]>(initialPrefs.trackOrder);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<TasSelection | null>(null);
  const [frameMs, setFrameMs] = useState(DEFAULT_DELTA_MS);
  const [msText, setMsText] = useState(msToText(DEFAULT_DELTA_MS));
  const [cellW, setCellW] = useState(initialPrefs.cellW);
  /** 录入模式：9 个映射键变成录入键（不持久化，每次打开默认关）。 */
  const [recording, setRecording] = useState(false);
  /** 数据版本号：撤销 / 粘贴 / 裁尾 / 改全局帧时长之后 +1，渲染层据此重建缓存。 */
  const [version, setVersion] = useState(0);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });

  const timelineRef = useRef<TasTimelineHandle | null>(null);
  const undoRef = useRef(createUndoStack());
  const clipRef = useRef<TasClip | null>(null);
  const selAnchorRef = useRef<number | null>(null);
  const prefTimerRef = useRef(0);
  /** 最新值镜像：window 级监听（快捷键）里读它，避免闭包过期。 */
  const docRef = useRef<Doc | null>(null);
  const frameMsRef = useRef(frameMs);
  const orderRef = useRef<TasKey[]>(order);
  const selectionRef = useRef<TasSelection | null>(selection);
  const cursorRef = useRef(0);
  const prefsRef = useRef(prefs);
  const recordingRef = useRef(recording);
  /** 录入「一轮」：同一帧（或同一选区）连续按键期间累积的键。 */
  const recordRoundRef = useRef<{ f0: number; f1: number; keys: Set<TasKey> } | null>(null);

  docRef.current = doc;
  frameMsRef.current = frameMs;
  orderRef.current = order;
  selectionRef.current = selection;
  cursorRef.current = cursor;
  prefsRef.current = prefs;
  recordingRef.current = recording;

  const locked = useMemo(() => new Set(prefs.locked), [prefs.locked]);
  const lockedRef = useRef<ReadonlySet<TasKey>>(locked);
  lockedRef.current = locked;

  // ---------------------------------------------------------------- 偏好

  /** 写盘做 300ms 防抖：滚轮缩放时 cellW 每帧都在变，不能每帧写 localStorage。 */
  const persistPrefs = useCallback((next: TasEditorPrefs) => {
    setPrefs(next);
    window.clearTimeout(prefTimerRef.current);
    prefTimerRef.current = window.setTimeout(() => saveTasPrefs(next), 300);
  }, []);

  const setGrid = (which: "vGrid" | "hGrid", value: boolean) => {
    persistPrefs({ ...prefsRef.current, [which]: value });
  };

  /** 轨道锁：锁住的轨道完全不可编辑（所有写操作都跳过它）。 */
  const toggleLock = useCallback(
    (key: TasKey) => {
      const cur = prefsRef.current.locked;
      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
      recordRoundRef.current = null;
      persistPrefs({ ...prefsRef.current, locked: next });
    },
    [persistPrefs]
  );

  const toggleRecording = useCallback(() => {
    recordRoundRef.current = null;
    setRecording(v => !v);
  }, []);

  // ---------------------------------------------------------------- 文件列表

  const refresh = useCallback(async () => {
    if (!tasDir) return;
    try {
      const list = await backend.list(tasDir, ["tas"]);
      setFiles(list.sort((a, b) => b.size - a.size));
    } catch (e) {
      setError(String(e));
    }
  }, [tasDir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---------------------------------------------------------------- 打开 / 保存

  const open = useCallback(async (path: string, name: string) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const bytes = await backend.readFile(path);
      const tas = await parseTas(new Uint8Array(bytes));
      const ms = tas.commonDeltaTime;
      const next: Doc = { path, name, tas };
      docRef.current = next;
      setDoc(next);
      setFrameMs(ms);
      setMsText(msToText(ms));
      cursorRef.current = 0;
      setCursor(0);
      setSelection(null);
      setDirty(false);
      undoRef.current.clear();
      setUndoState({ canUndo: false, canRedo: false });
      clipRef.current = null;
      setVersion(v => v + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(
    async (asNew = false) => {
      const d = docRef.current;
      if (!d) return;
      setBusy(true);
      setError("");
      try {
        let target = d.path;
        if (asNew) {
          const picked = await saveDialog({
            title: t("tas.saveAs"),
            defaultPath: d.path,
            filters: [{ name: "TAS", extensions: ["tas"] }]
          });
          if (!picked) return;
          target = picked;
        }
        // 覆盖已存在的文件前先留一份 .bak（失败只警告，不能拦住保存）
        try {
          if (await backend.exists(target)) await backend.copy(target, `${target}.bak`);
        } catch (e) {
          console.warn("TAS 备份失败：", e);
        }
        // 数据长度就是 totalFrames（含尾部空帧）—— 保存按它写，不自动裁尾
        const bytes = await writeTas(d.tas);
        await backend.writeFile(target, Array.from(bytes));
        if (asNew) {
          const next: Doc = {
            ...d,
            path: target,
            name: target.split(/[\\/]/).pop() ?? d.name
          };
          docRef.current = next;
          setDoc(next);
        }
        setDirty(false);
        setStatus(t("tas.saved"));
        void refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  // ---------------------------------------------------------------- 撤销 / 重做

  const syncUndo = () => {
    setUndoState({ canUndo: undoRef.current.canUndo, canRedo: undoRef.current.canRedo });
  };

  const snapshot = (): UndoEntry => ({
    data: (docRef.current as Doc).tas.data.slice(),
    frameMs: frameMsRef.current
  });

  /**
   * 开一次可撤销操作。`commit` 把操作**前**的快照入栈；`discard` 表示这次操作
   * 其实没改到数据（比如点了一个已经是那个状态的格子），不留撤销步。
   */
  const beginOp = useCallback((): OpHandle => {
    const entry = snapshot();
    return {
      commit: () => {
        undoRef.current.push(entry);
        syncUndo();
        setDirty(true);
      },
      discard: () => undefined
    };
  }, []);

  const restore = (entry: UndoEntry) => {
    const d = docRef.current;
    if (!d) return;
    d.tas.data = entry.data;
    frameMsRef.current = entry.frameMs;
    setFrameMs(entry.frameMs);
    setMsText(msToText(entry.frameMs));
    setSelection(null);
    setVersion(v => v + 1);
    setDirty(true);
  };

  const undo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const prev = undoRef.current.undo({
      data: d.tas.data.slice(),
      frameMs: frameMsRef.current
    });
    if (!prev) return;
    restore(prev);
    syncUndo();
  }, []);

  const redo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const next = undoRef.current.redo({
      data: d.tas.data.slice(),
      frameMs: frameMsRef.current
    });
    if (!next) return;
    restore(next);
    syncUndo();
  }, []);

  // ---------------------------------------------------------------- 编辑命令

  /** 改全局帧时长：把每一帧都写成同一个值（编辑器不支持逐帧不同）。 */
  const applyFrameMs = useCallback((ms: number) => {
    const d = docRef.current;
    if (!d || !Number.isFinite(ms) || ms <= 0) return;
    const entry = snapshot();
    setFrameDuration(d.tas, ms);
    undoRef.current.push(entry);
    syncUndo();
    frameMsRef.current = ms;
    setFrameMs(ms);
    setMsText(msToText(ms));
    setDirty(true);
    setVersion(v => v + 1);
  }, []);

  const trimTailCmd = () => {
    const d = docRef.current;
    if (!d) return;
    const entry = snapshot();
    const removed = trimTail(d.tas);
    if (removed <= 0) {
      setStatus(t("tas.trimNone"));
      return;
    }
    undoRef.current.push(entry);
    syncUndo();
    setDirty(true);
    setVersion(v => v + 1);
    const limit = Math.max(0, d.tas.frameCount - 1);
    cursorRef.current = Math.min(cursorRef.current, limit);
    setCursor(cursorRef.current);
    setStatus(t("tas.trimDone", { n: removed }));
  };

  const moveCursor = useCallback((frame: number, extend: boolean) => {
    const d = docRef.current;
    if (!d) return;
    const limit = paintableFrames(d.tas.frameCount) - 1;
    const f = Math.max(0, Math.min(limit, frame));
    const prevCursor = cursorRef.current;
    cursorRef.current = f;
    setCursor(f);
    if (extend) {
      const anchor = selAnchorRef.current ?? prevCursor;
      selAnchorRef.current = anchor;
      setSelection({
        f0: Math.min(anchor, f),
        f1: Math.max(anchor, f),
        t0: 0,
        t1: orderRef.current.length - 1
      });
    } else {
      selAnchorRef.current = null;
      setSelection(null);
    }
    timelineRef.current?.reveal(f);
  }, []);

  /**
   * `Tab` / `Shift+Tab`：有选区 = 整段平移一帧（选区跟着走），没选区 = 移动光标。
   */
  const stepTab = useCallback(
    (dir: number) => {
      const d = docRef.current;
      if (!d) return;
      const sel = selectionRef.current;
      recordRoundRef.current = null;
      if (!sel) {
        moveCursor(cursorRef.current + dir, false);
        return;
      }
      const op = beginOp();
      if (
        shiftRange(d.tas, sel, dir, orderRef.current, lockedRef.current, frameMsRef.current)
      ) {
        op.commit();
        setVersion(v => v + 1);
        const limit = paintableFrames(d.tas.frameCount) - 1;
        const next = {
          f0: Math.max(0, Math.min(limit, sel.f0 + dir)),
          f1: Math.max(0, Math.min(limit, sel.f1 + dir)),
          t0: sel.t0,
          t1: sel.t1
        };
        selectionRef.current = next;
        setSelection(next);
        cursorRef.current = next.f0;
        setCursor(next.f0);
        timelineRef.current?.reveal(next.f0);
      } else {
        op.discard();
      }
    },
    [beginOp, moveCursor]
  );

  /**
   * 录入模式：按一次映射键 = **完全覆盖**当前帧（有选区则覆盖整个选区）。
   * 同一帧内连续按键是累加；光标离开该帧再回来就重新开始一轮。
   */
  const recordKey = useCallback(
    (key: TasKey) => {
      const d = docRef.current;
      if (!d) return;
      const sel = selectionRef.current;
      const f0 = sel ? sel.f0 : cursorRef.current;
      const f1 = sel ? sel.f1 : cursorRef.current;
      let round = recordRoundRef.current;
      if (!round || round.f0 !== f0 || round.f1 !== f1) {
        round = { f0, f1, keys: new Set<TasKey>() };
        recordRoundRef.current = round;
      }
      round.keys.add(key);
      const op = beginOp();
      if (
        coverRange(
          d.tas,
          f0,
          f1,
          [...round.keys],
          orderRef.current,
          lockedRef.current,
          frameMsRef.current
        )
      ) {
        op.commit();
        setVersion(v => v + 1);
      } else {
        op.discard();
      }
    },
    [beginOp]
  );

  const deleteSelection = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const sel = selectionRef.current ?? {
      f0: cursorRef.current,
      f1: cursorRef.current,
      t0: 0,
      t1: orderRef.current.length - 1
    };
    const op = beginOp();
    if (clearRange(d.tas, sel, orderRef.current, lockedRef.current)) {
      op.commit();
      setVersion(v => v + 1);
    } else {
      op.discard();
    }
  }, [beginOp]);

  const copySelection = useCallback(
    (cut: boolean) => {
      const d = docRef.current;
      if (!d) return;
      const sel = selectionRef.current ?? {
        f0: cursorRef.current,
        f1: cursorRef.current,
        t0: 0,
        t1: orderRef.current.length - 1
      };
      const tracks = orderRef.current.slice(sel.t0, sel.t1 + 1);
      if (tracks.length === 0) return;
      clipRef.current = copyRange(d.tas, tracks, sel.f0, sel.f1);
      setStatus(t("tas.copied", { n: sel.f1 - sel.f0 + 1 }));
      if (cut) {
        const op = beginOp();
        if (clearRange(d.tas, sel, orderRef.current, lockedRef.current)) {
          op.commit();
          setVersion(v => v + 1);
        } else {
          op.discard();
        }
      }
    },
    [beginOp]
  );

  const pasteClipboard = useCallback(
    (insert: boolean) => {
      const d = docRef.current;
      const clip = clipRef.current;
      if (!d) return;
      if (!clip) {
        setStatus(t("tas.noClipboard"));
        return;
      }
      const sel = selectionRef.current;
      const at = sel ? sel.f0 : cursorRef.current;
      const op = beginOp();
      const [from, to] = pasteClip(
        d.tas,
        clip,
        at,
        frameMsRef.current,
        insert ? "insert" : "overwrite",
        lockedRef.current
      );
      op.commit();
      setSelection(null);
      cursorRef.current = from;
      setCursor(from);
      setVersion(v => v + 1);
      setStatus(t("tas.pasted", { n: to - from + 1 }));
      timelineRef.current?.reveal(from);
    },
    [beginOp]
  );

  // ---------------------------------------------------------------- 快捷键

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!docRef.current || isTypingTarget(e.target)) return;
      if (e.key === "F2") {
        e.preventDefault();
        recordRoundRef.current = null;
        setRecording(v => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === "y") {
          e.preventDefault();
          redo();
        } else if (key === "c") {
          e.preventDefault();
          copySelection(false);
        } else if (key === "x") {
          e.preventDefault();
          copySelection(true);
        } else if (key === "v") {
          e.preventDefault();
          pasteClipboard(e.shiftKey);
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        stepTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (recordingRef.current) {
        const key = recordKeyFor(e.key);
        if (key) {
          e.preventDefault();
          recordKey(key);
          return;
        }
        // Home/End/Delete 在两种模式下都一样；其余未映射的键（W/S/A/D…）交给时间轴
        if (e.key !== "Home" && e.key !== "End" && e.key !== "Delete" && e.key !== "Backspace") {
          return;
        }
      }
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          moveCursor(cursorRef.current - 1, e.shiftKey);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveCursor(cursorRef.current + 1, e.shiftKey);
          break;
        case "Home":
          e.preventDefault();
          moveCursor(0, e.shiftKey);
          break;
        case "End":
          e.preventDefault();
          moveCursor((docRef.current?.tas.frameCount ?? 1) - 1, e.shiftKey);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          deleteSelection();
          break;
        case "Escape":
          selAnchorRef.current = null;
          setSelection(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelection, deleteSelection, moveCursor, pasteClipboard, recordKey, redo, stepTab, undo]);

  // ---------------------------------------------------------------- 状态

  const totalSeconds = doc ? (doc.tas.frameCount * frameMs) / 1000 : 0;
  const fps = frameMs > 0 ? 1000 / frameMs : 0;
  /** 当前帧的按键（光标可能落在右侧余量里，那里没有数据）。 */
  const currentKeys = doc && cursor < doc.tas.frameCount ? doc.tas.keysAt(cursor) : [];
  const zoomPct = (cellW / DEFAULT_TAS_PREFS.cellW) * 100;
  /** 缩到最小时 14px/帧 的百分比只剩个位数，保留一位小数才看得出还在变。 */
  const zoomText = `${zoomPct >= 10 ? Math.round(zoomPct) : zoomPct.toFixed(1)}%`;
  const titleText = useMemo(() => {
    if (!doc) return t("tas.subtitle");
    const parts = [
      doc.name,
      `${doc.tas.frameCount.toLocaleString()} ${t("tas.frames")}`,
      `${totalSeconds.toFixed(3)} ${t("tas.seconds")}`,
      `${t("tas.frame")} ${cursor.toLocaleString()}`,
      dirty ? t("tas.modified") : t("tas.clean")
    ];
    if (selection) {
      parts.push(
        `${t("tas.sel")} ${(selection.f1 - selection.f0 + 1).toLocaleString()}×${
          selection.t1 - selection.t0 + 1
        }`
      );
    }
    return parts.join(" · ");
  }, [cursor, dirty, doc, selection, totalSeconds]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* 标题栏（可拖拽） */}
      <div
        className="flex h-11 shrink-0 items-stretch gap-3 border-b bg-background pr-1 pl-3"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <FileClock className="pointer-events-none size-4 text-muted-foreground" />
          <span className="pointer-events-none text-sm font-medium">{t("tas.title")}</span>
        </div>
        <div
          className="pointer-events-none flex flex-1 items-center truncate text-xs text-muted-foreground"
          data-tauri-drag-region
        >
          {titleText}
        </div>
        <TitleBarControls />
      </div>

      {error && (
        <div className="shrink-0 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 左：TAS 目录里的文件 */}
        <div className="flex w-56 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">{t("tas.openRecent")}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("tas.reload")}
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {!tasDir && (
              <p className="px-1 py-2 text-xs text-muted-foreground">{t("tas.noInstance")}</p>
            )}
            {tasDir && files.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">{t("tas.noFiles")}</p>
            )}
            {files.map(file => {
              const path = `${tasDir}/${file.name}`;
              const active = doc?.path === path;
              return (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => void open(path, file.name)}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                    active ? "bg-accent" : ""
                  }`}
                >
                  <span className="truncate text-xs">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 右：工具栏 + 时间轴 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
            <Button
              variant="default"
              size="sm"
              disabled={!doc || !dirty || busy}
              onClick={() => void save(false)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {t("tas.save")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!doc || busy}
              onClick={() => void save(true)}
            >
              {t("tas.saveAs")}
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />

            <Button
              variant="outline"
              size="icon-sm"
              title={`${t("tas.undo")} (Ctrl+Z)`}
              disabled={!undoState.canUndo}
              onClick={undo}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={`${t("tas.redo")} (Ctrl+Shift+Z)`}
              disabled={!undoState.canRedo}
              onClick={redo}
            >
              <Redo2 className="size-3.5" />
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />

            <Button
              variant={recording ? "default" : "outline"}
              size="sm"
              disabled={!doc}
              title={`${t("tas.recordHint")} (F2)`}
              aria-pressed={recording}
              onClick={toggleRecording}
            >
              <Keyboard className="size-3.5" />
              {recording ? t("tas.recordOn") : t("tas.recordOff")}
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />

            {/* 帧时长：全局统一，改它 = 把每一帧都写成这个值（不支持变速） */}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span title={t("tas.frameMs")}>{t("tas.frameMs")}</span>
              <Input
                type="number"
                step="0.001"
                min="0.01"
                className="h-7 w-24 text-xs"
                value={msText}
                disabled={!doc}
                onChange={e => setMsText(e.target.value)}
                onBlur={() => {
                  const ms = Number(msText);
                  if (Number.isFinite(ms) && ms > 0) applyFrameMs(ms);
                  else setMsText(msToText(frameMsRef.current));
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              ms
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("tas.fps", { n: fps >= 10 ? Math.round(fps) : Math.round(fps * 10) / 10 })}
            </span>
            <div className="flex items-center gap-0.5">
              {FPS_PRESETS.map(p => (
                <Button
                  key={p}
                  variant={Math.abs(fps - p) < 0.5 ? "secondary" : "ghost"}
                  size="xs"
                  disabled={!doc}
                  title={`${p} fps`}
                  onClick={() => applyFrameMs(1000 / p)}
                >
                  {p}
                </Button>
              ))}
            </div>

            <span className="mx-0.5 h-5 w-px bg-border" />

            <Button
              variant={prefs.vGrid ? "secondary" : "ghost"}
              size="xs"
              disabled={!doc}
              title={t("tas.gridVHint")}
              onClick={() => setGrid("vGrid", !prefs.vGrid)}
            >
              {t("tas.gridV")}
            </Button>
            <Button
              variant={prefs.hGrid ? "secondary" : "ghost"}
              size="xs"
              disabled={!doc}
              title={t("tas.gridHHint")}
              onClick={() => setGrid("hGrid", !prefs.hGrid)}
            >
              {t("tas.gridH")}
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />

            <Button
              variant="outline"
              size="icon-sm"
              title={`${t("tas.zoomOut")} (S)`}
              disabled={!doc}
              onClick={() => timelineRef.current?.zoomStep(-1)}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
              {zoomText}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              title={`${t("tas.zoomIn")} (W)`}
              disabled={!doc}
              onClick={() => timelineRef.current?.zoomStep(1)}
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={t("tas.zoomFit")}
              disabled={!doc}
              onClick={() => timelineRef.current?.fitAll()}
            >
              <Maximize2 className="size-3.5" />
            </Button>

            <span className="mx-0.5 h-5 w-px bg-border" />

            <Button
              variant="outline"
              size="sm"
              title={t("tas.trimTailHint")}
              disabled={!doc}
              onClick={trimTailCmd}
            >
              <Scissors className="size-3.5" />
              {t("tas.trimTail")}
            </Button>

            {status && (
              <span className="truncate text-xs text-muted-foreground">{status}</span>
            )}
            {/* 当前帧的按键一眼可见（录入模式尤其需要） */}
            <div className="ml-auto flex min-w-0 items-center gap-1" aria-label={t("tas.frameKeys")}>
              <span className="shrink-0 text-xs text-muted-foreground">{t("tas.frameKeys")}</span>
              {currentKeys.length === 0 ? (
                <span className="text-xs text-muted-foreground/70">{t("tas.noKeys")}</span>
              ) : (
                currentKeys.map(key => (
                  <span
                    key={key}
                    className="flex shrink-0 items-center gap-1 rounded border px-1 py-0.5"
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: trackColor(key, dark) }}
                    />
                    <span className="font-mono text-[10px] leading-none">
                      {KEY_META[key].short}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>

          {!doc ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {t("tas.hint")}
            </div>
          ) : (
            <TasTimeline
              ref={timelineRef}
              tas={doc.tas}
              frameMs={frameMs}
              order={order}
              dark={dark}
              vGrid={prefs.vGrid}
              hGrid={prefs.hGrid}
              cursor={cursor}
              selection={selection}
              version={version}
              defaultCellW={prefs.cellW}
              onCellWChange={next => {
                setCellW(next);
                if (Math.abs(next - prefsRef.current.cellW) > 0.5) {
                  persistPrefs({ ...prefsRef.current, cellW: next });
                }
              }}
              onCursor={f => {
                cursorRef.current = f;
                setCursor(f);
              }}
              onSelection={sel => {
                selectionRef.current = sel;
                setSelection(sel);
                // 选区被拖起来的那一刻定下锚点，之后一直用它
                if (sel && selAnchorRef.current === null) selAnchorRef.current = sel.f0;
                if (!sel) selAnchorRef.current = null;
              }}
              onOrderChange={next => {
                setOrder(next);
                orderRef.current = next;
                persistPrefs({ ...prefsRef.current, trackOrder: next });
              }}
              onBeginOp={beginOp}
              onMutated={() => setDirty(true)}
              locked={locked}
              recording={recording}
              onToggleLock={toggleLock}
            />
          )}

          <TasHintBar />
        </div>
      </div>
    </div>
  );
}
