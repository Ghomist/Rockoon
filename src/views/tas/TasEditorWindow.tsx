import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Clapperboard,
  Eye,
  FileClock,
  FileText,
  Gamepad2,
  Hash,
  Loader2,
  Maximize2,
  MousePointerClick,
  PencilLine,
  Play,
  Redo2,
  RefreshCw,
  Search,
  Save,
  Scissors,
  SkipBack,
  TriangleAlert,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { toast } from "sonner";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import TitleBarControls from "@/components/TitleBarControls";
import backend from "@/backend";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { launchInstance } from "@/services/launcher";
import { PLAYER_IMAGE, restoreTasConfig } from "@/services/tasGuard";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useDarkMode } from "@/utils/theme";
import { dialog } from "@/utils/ui/feedback";
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
  firstPressedFrame,
  frameView,
  hasKeyAt,
  moveBlock,
  pasteClip,
  setFrameDuration,
  grabRun,
  jumpRunEdge,
  setRunLength,
  shiftRange,
  trimTail,
  type TasClip,
  type TasSelection,
  type UndoEntry
} from "@/tas/editing";
import {
  TAS_LEVELS,
  applyPlayback,
  rememberRestore,
  inferLevel,
  levelValue,
  looksLikeBallanceTas,
  planPlayback,
  type TasCfgChange
} from "@/tas/play";
import {
  DEFAULT_TAS_PREFS,
  GAME_RESOLUTIONS,
  MAX_PLAY_SPEED,
  PLAY_SPEED_STOPS,
  loadTasPrefs,
  saveTasPrefs,
  type TasEditorPrefs
} from "@/tas/prefs";
import { trackColor } from "@/tas/render";
import { formatFrameTime, paintableFrames } from "@/tas/viewport";
import TasTimeline, {
  type OpHandle,
  type TasMouseMode,
  type TasTimelineHandle
} from "./TasTimeline";
import TasHintBar from "./TasHints";

type ManagedFile = { name: string; size: number };
/** 文件列表里显示的元数据。 */
type FileMeta = { frames: number; fps: number; seconds: number };
type Doc = { path: string; name: string; tas: TasFile };

/** 一键播放要问用户的事：改配置 / 重启游戏。 */
type PlayAsk =
  | { kind: "config"; changes: TasCfgChange[] }
  | { kind: "restart" };

/** 鼠标模式四选一（快捷键 1~4）：**选择是默认模式**。 */
/** 视图里三个互相独立的开关（纵线 / 横线 / 分区），存在偏好里。 */
const GRID_TOGGLES = [
  { key: "vGrid", labelKey: "tas.gridV", hintKey: "tas.gridVHint" },
  { key: "hGrid", labelKey: "tas.gridH", hintKey: "tas.gridHHint" },
  { key: "bands", labelKey: "tas.bands", hintKey: "tas.bandsHint" }
] as const;

const MOUSE_MODES: {
  id: TasMouseMode;
  key: string;
  labelKey: string;
  hintKey: string;
}[] = [
  {
    id: "select",
    key: "1",
    labelKey: "tas.modeSelect",
    hintKey: "tas.modeSelectHint"
  },
  {
    id: "draw",
    key: "2",
    labelKey: "tas.modeDraw",
    hintKey: "tas.modeDrawHint"
  },
  {
    id: "fill",
    key: "3",
    labelKey: "tas.modeFill",
    hintKey: "tas.modeFillHint"
  },
  {
    id: "record",
    key: "4",
    labelKey: "tas.modeRecord",
    hintKey: "tas.modeRecordHint"
  }
];

/** 焦点在输入框（或弹窗）里时别抢键盘（帧时长输入框要用 W/S/A/D 打字）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  // alertdialog 是一键播放的确认框（radix 的 role 与普通对话框不同）
  if (el.closest('[role="dialog"], [role="alertdialog"]')) return true;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** 文件是不是躺在 TAS 目录里（`instancePath` 是反斜杠、文件列表里拼的是正斜杠，先归一化）。 */
function pathInTasDir(path: string, tasDir: string): boolean {
  if (!tasDir) return false;
  const norm = (s: string) =>
    s.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(path).startsWith(`${norm(tasDir)}/`);
}

const msToText = (ms: number) => String(Math.round(ms * 1000) / 1000);

/**
 * 游戏两侧（文件列表 / 控制面板）各自至少要这么宽才好用；窗口装不下时给提示。
 * 两栏本身是等宽的（flex-1 + basis-0），不存宽度。
 */
const SIDE_MIN_W = 320;
/** 下半区（时间轴 + 说明条）至少要留这么高。 */
const TIMELINE_MIN_H = 200;

/** 关闭窗口时对游戏的处置：kill 一起关 / keep 留着跑 / cancel 不关了。 */
type CloseChoice = "kill" | "keep" | "cancel";

/** 游戏窗口（嵌进右上区域的那个原生窗口）的状态。 */
type GameState = "idle" | "launching" | "running" | "stopping";

/** 等 Player.exe 退干净的上限。 */
const PLAYER_EXIT_TIMEOUT_MS = 10000;

/**
 * 等所有 Player.exe 都退出（`kill` 只是发出 taskkill、不等它结束，进程往往还要再活一会儿；
 * 这时候再启动，Ballance 不支持多开会出问题）。超时返回 false。
 */
async function waitForPlayerExit(): Promise<boolean> {
  const deadline = Date.now() + PLAYER_EXIT_TIMEOUT_MS;
  for (;;) {
    const pids = await backend
      .findProcesses(PLAYER_IMAGE)
      .catch(() => [] as number[]);
    if (pids.length === 0) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => window.setTimeout(resolve, 200));
  }
}

/** 有未保存的改动时问一句：保存 / 不保存 / 取消（关掉对话框 = 取消）。 */
function askUnsaved(name: string): Promise<"save" | "discard" | "cancel"> {
  return new Promise(resolve => {
    dialog.warning({
      title: t("tas.unsavedTitle"),
      content: t("tas.unsavedBody", { name }),
      positiveText: t("tas.unsavedSave"),
      negativeText: t("tas.unsavedDiscard"),
      onPositiveClick: () => resolve("save"),
      onNegativeClick: () => resolve("discard"),
      // 点了按钮之后也会走到这里，但 Promise 只认第一次 resolve
      onClose: () => resolve("cancel")
    });
  });
}

/** 游戏进程没了：清掉 app store 里的运行状态（不然下次播放会以为还在跑）。 */
function clearRunningInstance() {
  const app = useAppStore.getState();
  if (!app.runningInstancePid) return;
  app.updateInstanceRunningTime();
  useAppStore.setState({
    runningInstancePid: undefined,
    runningInstancePath: undefined,
    runningInstanceTimestamp: 0
  });
}

/**
 * TAS 编辑器（独立窗口 `?window=tas`，见 `src/services/tasWindow.ts`）。
 *
 * 职责：文件列表 / 打开保存 / 撤销重做栈 / 剪贴板 / 快捷键 / 工具栏。
 * 渲染与指针交互都在 `TasTimeline`（canvas）里。
 */
export default function TasEditorWindow() {
  const dark = useDarkMode();

  const instancePath = usePrefStore(s => s.instancePath);
  /** BallanceTAS 2.0 把项目放在 `ModLoader/TAS`（旧的 TASSupport 用 TASRecords，已废弃）。 */
  const tasDir = instancePath ? `${instancePath}/ModLoader/TAS` : "";
  /** BallanceTAS 的配置（一键播放要改的就是它）。 */
  const cfgPath = instancePath
    ? `${instancePath}/ModLoader/Configs/BallanceTAS.cfg`
    : "";

  const initialPrefs = useMemo(() => loadTasPrefs(), []);

  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);
  const [prefs, setPrefs] = useState<TasEditorPrefs>(initialPrefs);
  const [order, setOrder] = useState<TasKey[]>(initialPrefs.trackOrder);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<TasSelection | null>(null);
  /** 「当前帧」输入框：聚焦时以本地输入为准，失焦 / 提交时回到 cursor。 */
  const [frameText, setFrameText] = useState("0");
  const [frameFocus, setFrameFocus] = useState(false);
  const [frameMs, setFrameMs] = useState(DEFAULT_DELTA_MS);
  const [fpsText, setFpsText] = useState(() =>
    msToText(1000 / DEFAULT_DELTA_MS)
  );
  const [fpsFocus, setFpsFocus] = useState(false);
  const [cellW, setCellW] = useState(initialPrefs.cellW);
  /** 鼠标模式（选择 / 绘制 / 填充 / 录入，不持久化，默认选择）。 */
  const [mode, setMode] = useState<TasMouseMode>("select");
  /** 时间轴右键菜单：指针位置 + 命中的格（null = 关着）。 */
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    frame: number;
    track: number;
  } | null>(null);
  /** 「按键时长」输入框：聚焦时以本地输入为准，失焦回到选区的实际帧数。 */
  const [lenText, setLenText] = useState("0");
  const [lenFocus, setLenFocus] = useState(false);
  /** 数据版本号：撤销 / 粘贴 / 裁尾 / 改全局帧时长之后 +1，渲染层据此重建缓存。 */
  const [version, setVersion] = useState(0);
  const [undoState, setUndoState] = useState({
    canUndo: false,
    canRedo: false
  });
  /** 一键播放的确认框（同一时刻只会开一个：先问配置、再问重启）。 */
  const [playAsk, setPlayAsk] = useState<PlayAsk | null>(null);
  /** 关闭窗口时问「游戏要不要一起关」。 */
  const [closeAsk, setCloseAsk] = useState(false);
  /** 游戏里实测的逻辑帧率（回放调速槽读回来的；没在跑 = null）。 */
  const [measuredFps, setMeasuredFps] = useState<number | null>(null);
  /** 游戏窗口可交互（鼠标键盘交给游戏）；默认只看不碰，鼠标不会被游戏吃掉。 */
  const [interactive, setInteractive] = useState(false);
  /** 三栏布局尺寸（拖分栏改，写进偏好）。 */
  /** 右上游戏区域：空态 / 启动中 / 游戏已嵌进来。 */
  const [game, setGame] = useState<{ state: GameState; pid: number }>({
    state: "idle",
    pid: 0
  });
  /**
   * 屏幕缩放系数。游戏区域的**物理像素**尺寸 = 选定的分辨率（这样游戏画面
   * 1:1 不被拉伸），所以 CSS 尺寸要除以 dpr。
   */
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  /** 窗口内容尺寸：区域装不下时要自动腾地方 / 给提示。 */
  const [winSize, setWinSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight
  }));

  const timelineRef = useRef<TasTimelineHandle | null>(null);
  const undoRef = useRef(createUndoStack());
  const clipRef = useRef<TasClip | null>(null);
  const selAnchorRef = useRef<number | null>(null);
  const prefTimerRef = useRef(0);
  /** 打开文件后要 reveal 的帧（等时间轴挂载 / 复位之后再说）。 */
  const pendingRevealRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  /** 藏 / 摆回游戏窗口（定义在后面；换文件时的询问框要用）。HTML 弹窗盖不住游戏窗口。 */
  const gameWindowRef = useRef({ hide: () => {}, show: () => {} });
  /** `save` 定义在后面；关窗 / 换文件时要用，先占个位。 */
  const saveRef = useRef<(asNew?: boolean) => Promise<boolean>>(
    async () => false
  );
  /** 最新值镜像：window 级监听（快捷键）里读它，避免闭包过期。 */
  const docRef = useRef<Doc | null>(null);
  const frameMsRef = useRef(frameMs);
  const orderRef = useRef<TasKey[]>(order);
  const selectionRef = useRef<TasSelection | null>(selection);
  const cursorRef = useRef(0);
  const prefsRef = useRef(prefs);
  const modeRef = useRef(mode);
  /** 录入「一轮」：同一帧（或同一选区）连续按键期间累积的键。 */
  const recordRoundRef = useRef<{
    f0: number;
    f1: number;
    keys: Set<TasKey>;
  } | null>(null);
  /** 一键播放确认框的 resolve（等用户点「打开并播放 / 重启并播放 / 取消」）。 */
  const playAnswerRef = useRef<((ok: boolean) => void) | null>(null);
  /** `beginOp` 依赖 `snapshot`，定义在下面；选择模式的两个回调先定义、用时再取。 */
  const beginOpRef = useRef<() => OpHandle>(() => ({
    commit: () => undefined,
    discard: () => undefined
  }));
  /** 游戏区域那个 div（它的几何就是要嵌游戏窗口的位置，单位 CSS px）。 */
  const regionRef = useRef<HTMLDivElement | null>(null);
  /** 游戏状态/布局的最新镜像：window 级监听与 interval 里读它，避免闭包过期。 */
  const gameRef = useRef(game);
  /** 关窗询问框的 resolve（等用户点「一起关掉 / 保留运行 / 取消」）。 */
  const closeAnswerRef = useRef<((choice: CloseChoice) => void) | null>(null);
  /** 当前目标回放帧率（0 = 不限速）的最新值：存活轮询里读。 */
  const targetFpsRef = useRef(0);
  /** 最近一次**成功**写进游戏的目标帧率；与 targetFpsRef 不一致就（重）发。 */
  const sentFpsRef = useRef<number | null>(null);

  docRef.current = doc;
  dirtyRef.current = dirty;
  frameMsRef.current = frameMs;
  orderRef.current = order;
  selectionRef.current = selection;
  gameRef.current = game;

  /** 「按键时长」输入框（选中单轨一段时可用；滚轮可微调，数字保持全选） */
  const lenInputRef = useRef<HTMLInputElement | null>(null);
  /** 选区变化是打字/滚轮造成的（不是点了新的一段）：别把输入框文本重新全选 */
  const lenTypingRef = useRef(false);

  // 选中一段（单轨）后自动把焦点放进「按键时长」，可以直接打字，不用再点一下（用户 m09881 #3）
  useEffect(() => {
    if (lenTypingRef.current) {
      lenTypingRef.current = false;
      return;
    }
    const el = lenInputRef.current;
    if (!el || !selection || selection.t0 !== selection.t1) return;
    if (document.activeElement !== el) el.focus();
    el.select();
  }, [selection]);

  // 帧数滚轮微调：必须挂原生监听（React 的 onWheel 是 passive 的，preventDefault 拦不住滚动）。
  // 回调体只在事件发生时执行，所以这里引用后面定义的 applyRunLength 不会踩 TDZ。
  useEffect(() => {
    const el = lenInputRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const sel = selectionRef.current;
      if (!docRef.current || !sel || sel.t0 !== sel.t1) return;
      ev.preventDefault();
      const step = (ev.deltaY > 0 ? -1 : 1) * (ev.shiftKey ? 10 : 1);
      const cur = Number(el.value);
      const base =
        el.value.trim() !== "" && Number.isFinite(cur)
          ? cur
          : sel.f1 - sel.f0 + 1;
      const next = Math.max(0, Math.round(base + step));
      applyRunLength(String(next));
      requestAnimationFrame(() => {
        el.focus();
        el.select();
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  cursorRef.current = cursor;
  prefsRef.current = prefs;
  modeRef.current = mode;

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

  /** 轨道锁：锁住的轨道完全不可编辑（所有写操作都跳过它）。 */
  const toggleLock = useCallback(
    (key: TasKey) => {
      const cur = prefsRef.current.locked;
      const next = cur.includes(key)
        ? cur.filter(k => k !== key)
        : [...cur, key];
      recordRoundRef.current = null;
      persistPrefs({ ...prefsRef.current, locked: next });
    },
    [persistPrefs]
  );

  /** 一键播放要进的关卡：记过的优先，否则按项目名猜（猜不出 = null，播放前必须先选）。 */
  const levelFor = (project: string): number | null =>
    prefsRef.current.projectLevels[project] ?? inferLevel(project);

  const setProjectLevel = (project: string, level: number) => {
    persistPrefs({
      ...prefsRef.current,
      projectLevels: { ...prefsRef.current.projectLevels, [project]: level }
    });
  };

  /** 选择模式：当前选区的「按键时长」= 选区内被按下的帧数（空格上是 0）。 */
  const selectionLength = useMemo(() => {
    const d = doc;
    const sel = selection;
    if (!d || !sel || sel.t0 !== sel.t1) return 0;
    const key = order[sel.t0];
    if (!key || !hasKeyAt(frameView(d.tas), sel.f0, key)) return 0;
    return sel.f1 - sel.f0 + 1;
    // version：撤销 / 粘贴 / 改时长之后数据变了，得重算
  }, [doc, selection, order, version]);

  /** 改「按键时长」：0 = 删掉这一段；>0 = 把这一段设成恰好 N 帧（在空格上就是从 0 新建按键）。 */
  const applyRunLength = useCallback((raw: string) => {
    // 打字/滚轮引起的选区变化不要再回头抢文本全选（不然每敲一位都被上一次的全选替掉）
    lenTypingRef.current = true;
    setLenText(raw);
    if (raw.trim() === "") return;
    const d = docRef.current;
    const sel = selectionRef.current;
    if (!d || !sel || sel.t0 !== sel.t1) return;
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 0) return;
    const key = orderRef.current[sel.t0];
    if (!key || lockedRef.current.has(key)) return;
    const op = beginOpRef.current();
    if (setRunLength(d.tas, sel.f0, sel.f1, key, n, frameMsRef.current)) {
      op.commit();
      setVersion(v => v + 1);
      const next = { ...sel, f1: n > 0 ? sel.f0 + n - 1 : sel.f0 };
      selectionRef.current = next;
      setSelection(next);
    } else {
      op.discard();
    }
  }, []);

  /** 选择模式：方向键直接搬动选中的那一段（左右 = 帧、上下 = 轨道）。 */
  const moveSelection = useCallback((dFrame: number, dTrack: number) => {
    const d = docRef.current;
    const sel = selectionRef.current;
    if (!d || !sel || sel.t0 !== sel.t1) return;
    const tracks = orderRef.current;
    const toTrack = sel.t0 + dTrack;
    const toFrame = sel.f0 + dFrame;
    if (toTrack < 0 || toTrack >= tracks.length || toFrame < 0) return;
    const key = tracks[sel.t0];
    if (!key || lockedRef.current.has(key)) return;
    const op = beginOpRef.current();
    if (hasKeyAt(frameView(d.tas), sel.f0, key)) {
      // 有内容：真的搬（目标轨道被锁住就整段不搬）
      if (lockedRef.current.has(tracks[toTrack])) {
        op.discard();
        return;
      }
      moveBlock(
        d.tas,
        [sel.f0, sel.f1],
        sel.t0,
        toFrame,
        toTrack,
        tracks,
        frameMsRef.current
      );
      op.commit();
      setVersion(v => v + 1);
    } else {
      op.discard(); // 空选：只挪插入点
    }
    const next = {
      f0: toFrame,
      f1: Math.max(toFrame, sel.f1 + dFrame),
      t0: toTrack,
      t1: toTrack
    };
    selectionRef.current = next;
    setSelection(next);
    // 「按键时长」聚焦时显示的是 lenText，得同步一份，不然方向键搬完数字还是旧的
    setLenText(String(next.f1 - next.f0 + 1));
    cursorRef.current = next.f0;
    setCursor(next.f0);
    timelineRef.current?.reveal(next.f0);
  }, []);

  // ---------------------------------------------------------------- 文件列表

  /** 列表里每个文件的元数据（解析一遍 .tas 得到）；key = 文件名|大小，null = 读不出来。 */
  const [fileMeta, setFileMeta] = useState<Record<string, FileMeta | null>>({});
  const fileMetaRef = useRef(new Map<string, FileMeta | null>());
  const [fileFilter, setFileFilter] = useState("");
  const metaKey = (f: ManagedFile) => `${f.name}|${f.size}`;

  /** 保存后同名文件的内容变了（大小可能没变）：丢掉它的缓存，下次刷新重新解析。 */
  const invalidateMeta = (name: string) => {
    for (const key of [...fileMetaRef.current.keys()])
      if (key.startsWith(`${name}|`)) fileMetaRef.current.delete(key);
  };

  const refresh = useCallback(async () => {
    if (!tasDir) return;
    try {
      const list = await backend.list(tasDir, ["tas"]);
      // 后端只列普通文件（不递归），这里再挡一道：`temp/`（BallanceTAS 的工作目录）里的东西不列
      setFiles(
        list
          .filter(f => !f.name.includes("/") && !f.name.includes("\\"))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true })
          )
      );
    } catch (e) {
      setError(String(e));
    }
  }, [tasDir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 打开编辑器时：上次一键播放没来得及改回去的配置（关编辑器时选了「保留运行」、
  // 编辑器崩了）现在补上 —— 游戏还在跑的话 restoreTasConfig 自己会跳过
  useEffect(() => {
    void restoreTasConfig();
  }, []);

  // 列表变了：把还没解析过的文件挨个读一遍（.tas 很小，几十个也就一眨眼）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const f of files) {
        const key = metaKey(f);
        if (fileMetaRef.current.has(key)) continue;
        let meta: FileMeta | null = null;
        try {
          const bytes = await backend.readFile(`${tasDir}/${f.name}`);
          const tas = await parseTas(new Uint8Array(bytes));
          const ms = tas.commonDeltaTime;
          meta = {
            frames: tas.frameCount,
            fps: ms > 0 ? 1000 / ms : 0,
            seconds: tas.durationSeconds
          };
        } catch {
          meta = null;
        }
        if (cancelled) return;
        fileMetaRef.current.set(key, meta);
        setFileMeta(m => ({ ...m, [key]: meta }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files, tasDir]);

  // ---------------------------------------------------------------- 打开 / 保存

  const open = useCallback(async (path: string, name: string) => {
    const cur = docRef.current;
    if (cur && dirtyRef.current && cur.path !== path) {
      gameWindowRef.current.hide();
      const choice = await askUnsaved(cur.name);
      gameWindowRef.current.show();
      if (choice === "cancel") return;
      if (choice === "save" && !(await saveRef.current(false))) return;
    }
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
      // 打开就直接跳到第一个有按键的帧（reveal 等时间轴挂载完再做，见下面那个 effect）
      const first = firstPressedFrame(tas);
      pendingRevealRef.current = first;
      cursorRef.current = first;
      setCursor(first);
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

  /**
   * 打开文件后让「第一个有按键的帧」进入视野。
   * 必须等 `TasTimeline` 挂载并做完「换文件复位视口」（子组件的 effect 先于父组件执行），
   * 否则会被那次复位盖掉。居中 / 贴不贴边沿用 `reveal` 自己的行为。
   */
  useEffect(() => {
    if (!doc) return;
    const frame = pendingRevealRef.current;
    if (frame === null) return;
    pendingRevealRef.current = null;
    timelineRef.current?.reveal(frame);
  }, [doc]);

  /** 保存；返回是否真的写盘成功（一键播放据此决定要不要继续）。 */
  const save = useCallback(
    async (asNew = false): Promise<boolean> => {
      const d = docRef.current;
      if (!d) return false;
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
          if (!picked) return false;
          target = picked;
        }
        // 覆盖已存在的文件前先留一份 .bak（失败只警告，不能拦住保存）
        try {
          if (await backend.exists(target))
            await backend.copy(target, `${target}.bak`);
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
        invalidateMeta(target.split(/[\\/]/).pop() ?? d.name);
        void refresh();
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );
  saveRef.current = save;

  // ---------------------------------------------------------------- 一键播放

  /** 弹确认框并等用户点（Esc / 取消 = false）。弹框前先把嵌进来的游戏窗口藏起来，
   * 否则弹框会被那个原生子窗口压住（HTML 盖不到原生窗口上面）。 */
  const askPlay = (ask: PlayAsk) =>
    new Promise<boolean>(resolve => {
      hideGameWindow();
      playAnswerRef.current = resolve;
      setPlayAsk(ask);
    });

  const answerPlay = (ok: boolean) => {
    setPlayAsk(null);
    const resolve = playAnswerRef.current;
    playAnswerRef.current = null;
    if (!ok) showGameWindow();
    resolve?.(ok);
  };

  // ---------------------------------------------------------------- 游戏窗口嵌入

  /** 右上区域的几何（**物理像素**）—— 送给 Rust 做 SetWindowPos。 */
  const regionRect = useCallback(() => {
    const el = regionRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    return {
      x: Math.round(r.left * scale),
      y: Math.round(r.top * scale),
      width: Math.round(r.width * scale),
      height: Math.round(r.height * scale)
    };
  }, []);

  /**
   * 把游戏窗口挪到屏幕外 = 临时藏起来。
   * 模态框要盖在这块区域上时必须先藏，否则弹窗会被游戏窗口压住点不动。
   */
  const hideGameWindow = useCallback(() => {
    if (gameRef.current.state !== "running") return;
    const { gameWidth, gameHeight } = prefsRef.current;
    void backend
      .moveGameWindow(-20000, -20000, gameWidth, gameHeight)
      .catch(() => undefined);
  }, []);

  const showGameWindow = useCallback(() => {
    if (gameRef.current.state !== "running") return;
    const rect = regionRect();
    if (!rect) return;
    void backend
      .moveGameWindow(rect.x, rect.y, rect.width, rect.height)
      .catch(() => undefined);
  }, [regionRect]);

  gameWindowRef.current = { hide: hideGameWindow, show: showGameWindow };

  /** 启动游戏，并把它的窗口嵌进右上区域（分辨率在启动时用 `-w/-h` 定死）。 */
  const startGame = useCallback(async (): Promise<boolean> => {
    const instancePathNow = usePrefStore.getState().instancePath;
    const app = useAppStore.getState();
    if (!instancePathNow) {
      toast.error(t("tas.playNoInstance"));
      return false;
    }
    // launchInstance 读的是 app store 里的实例数据；TAS 窗口不一定加载过
    if (!app.selectedInstanceData) {
      const ok = await app.loadInstance(instancePathNow);
      if (!ok) {
        toast.error(t("tas.playNoInstance"));
        return false;
      }
    }
    const rect = regionRect();
    if (!rect) {
      toast.error(t("tas.gameRegionMissing"));
      return false;
    }
    const { gameWidth, gameHeight } = prefsRef.current;
    setGame({ state: "launching", pid: 0 });
    setInteractive(false);
    setMeasuredFps(null);
    try {
      const initialFps = targetFpsRef.current;
      const pid = await launchInstance({
        // 游戏的渲染上下文是固定尺寸：分辨率必须在启动时定，之后窗口变大只会拉伸画面
        args: ["-w", String(gameWidth), "-h", String(gameHeight)],
        // 带上它 RockoonIO 才会打开回放调速（初始帧率；之后走共享内存随时改）
        env: { ROCKOON_TAS_FPS: String(initialFps) },
        // 主窗口不要因为「启动时隐藏窗口」那个偏好被藏走（TAS 编辑器要一直看得到）
        keepMainWindowVisible: true,
        // 回放期间别让编辑器（WebView2/mouse 一动就烧 CPU）把游戏挤掉帧
        highPriority: true
      });
      if (!pid) throw new Error(t("tas.gameLaunchFailed"));
      // 初始帧率已经随环境变量进去了；启动期间改过速度的话，running 之后会补发
      sentFpsRef.current = initialFps;
      setGame({ state: "launching", pid });
      // 游戏窗口要几秒才出来；Rust 那边自己在等（最多 30s）
      await backend.attachGameWindow(
        pid,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
      setGame({ state: "running", pid });
      return true;
    } catch (e) {
      toast.error(String(e));
      setGame({ state: "idle", pid: 0 });
      return false;
    }
  }, [regionRect]);

  /**
   * 停止：解除嵌入 + 结束游戏进程，**等 Player.exe 真的退干净**才回到空态。
   * 期间是 `stopping`：播放按钮都不能点（这时候再开一个会撞上还没退的旧进程）。
   * 退干净后默认把一键播放改过的 BallanceTAS 配置改回去（`restore = false`：重启流程里
   * 刚写好新配置，这时候不能改回去）。返回是否退干净了。
   */
  const stopGame = useCallback(async (restore = true): Promise<boolean> => {
    const g = gameRef.current;
    if (g.state !== "running") return true;
    // 先切出 running：400ms 的存活轮询就此停下，不会再去摆一个正在关的窗口
    gameRef.current = { state: "stopping", pid: 0 };
    setGame({ state: "stopping", pid: 0 });
    setMeasuredFps(null);
    setInteractive(false);
    await backend.detachGameWindow().catch(() => undefined);
    if (g.pid) await backend.kill(g.pid).catch(() => undefined);
    const gone = await waitForPlayerExit();
    clearRunningInstance();
    gameRef.current = { state: "idle", pid: 0 };
    setGame({ state: "idle", pid: 0 });
    if (!gone) toast.error(t("tas.gameStillRunning"));
    else if (restore) void restoreTasConfig();
    return gone;
  }, []);

  /**
   * 把当前目标帧率写进游戏（RockoonIO 的共享内存槽，下一帧生效）。
   * 槽还没建好会失败 —— sentFpsRef 不更新，存活轮询会接着重试。
   */
  const pushFrameLimit = useCallback(async () => {
    const g = gameRef.current;
    if (g.state !== "running" || !g.pid) return;
    const fps = targetFpsRef.current;
    try {
      await backend.setGameFrameLimit(g.pid, fps);
      sentFpsRef.current = fps;
    } catch {
      // 模组还在载入：等下一轮
    }
  }, []);

  // 游戏跑着的时候：区域几何变了就重新摆窗口；进程没了就回空态。
  // （拖分栏 / 缩放窗口 / 滚动态都只改变 getBoundingClientRect，所以用轮询最省事）
  useEffect(() => {
    if (game.state !== "running") return;
    let last = "";
    const tick = async () => {
      const rect = regionRect();
      if (rect) {
        const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
        if (key !== last) {
          last = key;
          await backend
            .moveGameWindow(rect.x, rect.y, rect.width, rect.height)
            .catch(() => undefined);
        }
      }
      const alive = await backend.check(game.pid).catch(() => true);
      if (!alive) {
        await backend.detachGameWindow().catch(() => undefined);
        clearRunningInstance();
        setGame({ state: "idle", pid: 0 });
        setMeasuredFps(null);
        setInteractive(false);
        // 游戏自己退出了（玩家在游戏里退出 / 崩了）：一样把配置改回去
        void restoreTasConfig();
        return;
      }
      // 上次没写进去（模组还没建好槽）或速度改过 → 再发一次
      if (sentFpsRef.current !== targetFpsRef.current) await pushFrameLimit();
      const stats = await backend.gameFrameLimit(game.pid).catch(() => null);
      setMeasuredFps(stats ? stats.measuredFps : null);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 400);
    return () => window.clearInterval(timer);
  }, [game, regionRect, pushFrameLimit]);

  // dpr 会跟着窗口在显示器之间移动而变（区域 CSS 尺寸 = 分辨率 / dpr），
  // 窗口尺寸也存一份：分辨率 / 窗口一变就要重新给区域腾地方
  useEffect(() => {
    const onResize = () => {
      setDpr(window.devicePixelRatio || 1);
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** 改回放速度（倍率，0 = 不限速）。播放中立刻生效。 */
  const setPlaySpeed = (speed: number) => {
    const next = Math.max(0, Math.min(MAX_PLAY_SPEED, speed));
    persistPrefs({ ...prefsRef.current, playSpeed: next });
  };

  /** 切换「游戏窗口可交互」：开 = 鼠标键盘交给游戏（鼠标会被它捕获）；关 = 只看不碰。 */
  const toggleInteractive = async () => {
    const next = !interactive;
    try {
      await backend.setGameWindowInteractive(next);
      setInteractive(next);
    } catch (e) {
      toast.error(String(e));
    }
  };

  /** 关窗时问「游戏要不要一起关」（先藏起游戏窗口，否则弹框被它压住）。 */
  const askCloseGame = useCallback(
    (resolve: (choice: CloseChoice) => void) => {
      closeAnswerRef.current = resolve;
      hideGameWindow();
      setCloseAsk(true);
    },
    [hideGameWindow]
  );

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async event => {
        const g = gameRef.current;
        const gameRunning = g.state === "running" && !!g.pid;
        const unsaved = !!docRef.current && dirtyRef.current;
        if (!gameRunning && !unsaved) return;
        // 必须在第一个 await 之前拦下：异步之后再 preventDefault 就晚了
        event.preventDefault();
        if (unsaved) {
          // HTML 弹窗盖不住游戏窗口，先把游戏挪开
          hideGameWindow();
          const choice = await askUnsaved(
            docRef.current?.name ?? t("tas.title")
          );
          if (
            choice === "cancel" ||
            (choice === "save" && !(await saveRef.current(false)))
          ) {
            showGameWindow();
            return;
          }
        }
        if (!gameRunning) {
          await win.destroy().catch(err => console.error("关闭窗口失败", err));
          return;
        }
        askCloseGame(async choice => {
          setCloseAsk(false);
          if (choice === "cancel") {
            showGameWindow();
            return;
          }
          await backend.detachGameWindow().catch(() => undefined);
          if (choice === "kill") {
            await backend.kill(g.pid).catch(() => undefined);
            // 等它退干净再改回配置；「保留运行」时改不了，留到下次（编辑器打开 / 正常启动前）
            if (await waitForPlayerExit()) await restoreTasConfig();
          }
          // destroy 需要 core:window:allow-destroy 权限（capabilities/default.json）；
          // 被拒时不要默默失败 —— 那会让窗口彻底关不掉。
          await win.destroy().catch(err => console.error("关闭窗口失败", err));
        });
      })
      .then(f => (unlisten = f));
    return () => unlisten?.();
  }, [askCloseGame, hideGameWindow, showGameWindow]);

  /** 「启动时自动播放：关 → 开」这样的一行。 */
  const describeChange = (c: TasCfgChange) => {
    const text = (v: string | undefined) => {
      if (v === undefined) return t("tas.playUnset");
      if (!c.toggle) return v;
      return v === "1" ? t("tas.playOn") : t("tas.playOff");
    };
    return t("tas.playChange", {
      label: t(c.labelKey),
      from: text(c.from),
      to: text(c.to)
    });
  };

  /**
   * 一键播放：把当前文件设成 BallanceTAS 的启动项目，然后启动（必要时先重启）游戏。
   * 顺序：保存 → 读配置 → 问「要不要打开自动加载」→ 写配置 → 问「要不要重启」→ 启动。
   *
   * `fromStart = false`（「播放」）：从编辑器当前帧开始看 —— 写 `TAS.SkipRenderUntilFrame`
   * = 光标帧，之前的帧照常跑物理但不渲染（RockoonIO 这时不限速，一路快进过去）。
   * `fromStart = true`（「从头播放」）：写 0，不跳过任何帧。
   */
  const playProject = async (fromStart: boolean) => {
    const d = docRef.current;
    if (!d || !instancePath) return;
    const state = gameRef.current.state;
    if (state === "launching" || state === "stopping") return;
    const skipFrames = fromStart
      ? 0
      : Math.max(0, Math.min(cursorRef.current, d.tas.frameCount - 1));
    // 1. BallanceTAS 只从 ModLoader/TAS 里找项目，文件必须先躺在那里
    if (!pathInTasDir(d.path, tasDir)) {
      toast.error(t("tas.playNeedsSave"));
      return;
    }
    // 录像不带关卡信息，2.0 的录像要等关卡载入才播：没有关卡就只会停在菜单里干等
    const project = d.name.replace(/\.tas$/i, "");
    const level = levelFor(project);
    if (level === null) {
      toast.error(t("tas.playNeedsLevel"));
      return;
    }
    // 2. 有未保存的改动先保存（走既有 save，含自动 .bak）
    if (dirty && !(await save(false))) return;
    // 3. 读 BallanceTAS 的配置；读不到 = mod 没装 / 没跑过
    let cfg: ModConfig;
    try {
      cfg = await backend.readModConfig(cfgPath);
    } catch {
      toast.error(t("tas.playNoConfig"));
      return;
    }
    if (!looksLikeBallanceTas(cfg)) {
      toast.error(t("tas.playNoConfig"));
      return;
    }
    const target = { project, level, skipFrames };
    const changes = planPlayback(cfg, target);
    // 4. 要动开关（不只是改项目名）就先问一句，用户确认了才写配置
    if (
      changes.some(c => c.toggle) &&
      !(await askPlay({ kind: "config", changes }))
    )
      return;
    try {
      if (changes.length) {
        await backend.saveModConfig(cfgPath, applyPlayback(cfg, target));
        // 播完（停止 / 游戏退出 / 关编辑器）要把这些项改回原值，不然正常开游戏也会自动进关卡回放
        rememberRestore(cfgPath, changes);
      }
    } catch (e) {
      toast.error(String(e));
      return;
    }
    // 5. 已经有游戏在跑就得先关：TAS 配置只在游戏启动时读一次，而且 Ballance 不支持多开。
    //    不只看自己摆进来的那个 —— 主窗口开的、上次没退干净的 Player.exe 也算
    const others = await backend
      .findProcesses(PLAYER_IMAGE)
      .catch(() => [] as number[]);
    if (gameRef.current.state === "running" || others.length > 0) {
      if (!(await askPlay({ kind: "restart" }))) return;
      // 摆在区域里的那个必须走 stopGame：先切出 running 再杀，否则 400ms 的存活轮询
      // 会看到旧 pid 没了，转头把**新**游戏的窗口 detach 掉
      if (gameRef.current.state === "running" && !(await stopGame(false)))
        return;
      const rest = await backend
        .findProcesses(PLAYER_IMAGE)
        .catch(() => [] as number[]);
      if (rest.length > 0) {
        gameRef.current = { state: "stopping", pid: 0 };
        setGame({ state: "stopping", pid: 0 });
        for (const pid of rest) await backend.kill(pid).catch(() => undefined);
        const gone = await waitForPlayerExit();
        clearRunningInstance();
        gameRef.current = { state: "idle", pid: 0 };
        setGame({ state: "idle", pid: 0 });
        if (!gone) {
          toast.error(t("tas.gameStillRunning"));
          return;
        }
      }
    }
    // 6. 启动，并把游戏窗口嵌进右上区域
    if (!(await startGame())) return;
    toast.success(
      skipFrames > 0
        ? t("tas.playStartingAt", {
            project,
            level: levelValue(level),
            frame: skipFrames
          })
        : t("tas.playStarting", { project, level: levelValue(level) })
    );
  };

  // ---------------------------------------------------------------- 撤销 / 重做

  const syncUndo = () => {
    setUndoState({
      canUndo: undoRef.current.canUndo,
      canRedo: undoRef.current.canRedo
    });
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
  beginOpRef.current = beginOp;

  const restore = (entry: UndoEntry) => {
    const d = docRef.current;
    if (!d) return;
    d.tas.data = entry.data;
    frameMsRef.current = entry.frameMs;
    setFrameMs(entry.frameMs);
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
        shiftRange(
          d.tas,
          sel,
          dir,
          orderRef.current,
          lockedRef.current,
          frameMsRef.current
        )
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

  /** `[` / `]`：跳到上/下一个按键段的边缘（所有轨道一起看，取帧号最近的）。Shift = 顺带扩选区。 */
  const jumpToRun = useCallback(
    (dir: -1 | 1, extend: boolean) => {
      const d = docRef.current;
      if (!d) return;
      const to = jumpRunEdge(d.tas, orderRef.current, cursorRef.current, dir);
      if (to === null) return;
      moveCursor(to, extend);
    },
    [moveCursor]
  );

  /** 右键菜单「选中整段」：把菜单里点的那一格所在的整段完整选中。 */
  const selectRunAt = useCallback(() => {
    const d = docRef.current;
    if (!d || !menu) return;
    const key = orderRef.current[menu.track];
    const run = key ? grabRun(d.tas, menu.frame, key) : null;
    if (!key || !run) return;
    moveCursor(menu.frame, false);
    const sel = { f0: run[0], f1: run[1], t0: menu.track, t1: menu.track };
    selectionRef.current = sel;
    setSelection(sel);
  }, [menu, moveCursor]);

  /** 右键命中的格上有没有按键段（决定「选中整段」能不能点）。 */
  const menuHasRun = useMemo(() => {
    if (!menu) return false;
    const d = docRef.current;
    const key = orderRef.current[menu.track];
    return !!(d && key && grabRun(d.tas, menu.frame, key));
  }, [menu, version]);

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
      if (!docRef.current) return;
      // 「按键时长」聚焦时：只有数字/退格/复制粘贴留给输入框，方向键与字母照旧归编辑器（用户 m09881 #2 #3）
      const lenEl = lenInputRef.current;
      if (lenEl && e.target === lenEl) {
        if (e.key === "Escape") {
          e.preventDefault();
          lenEl.blur();
          return;
        }
        if (
          /^[0-9]$/.test(e.key) ||
          e.key === "Backspace" ||
          e.key === "Delete" ||
          e.ctrlKey ||
          e.metaKey
        ) {
          return;
        }
      } else if (isTypingTarget(e.target)) {
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
        } else if (key === "s") {
          // 通用习惯：Ctrl+S 保存、Ctrl+Shift+S 另存为
          e.preventDefault();
          void save(e.shiftKey);
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        stepTab(e.shiftKey ? -1 : 1);
        return;
      }
      // 鼠标模式四选一（1 选择 / 2 绘制 / 3 填充 / 4 录入）
      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        e.preventDefault();
        recordRoundRef.current = null;
        setMode(
          e.key === "1"
            ? "select"
            : e.key === "2"
              ? "draw"
              : e.key === "3"
                ? "fill"
                : "record"
        );
        return;
      }
      // `[` / `]` = 跳到上/下一个按键段的边缘（Shift = 顺带把选区扩过去）
      if (e.code === "BracketLeft" || e.code === "BracketRight") {
        e.preventDefault();
        jumpToRun(e.code === "BracketRight" ? 1 : -1, e.shiftKey);
        return;
      }
      // 缩放的通用别键：`+` / `=` 放大，`-` / `_` 缩小（与 W / S 等价）
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        timelineRef.current?.zoomStep(1);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        timelineRef.current?.zoomStep(-1);
        return;
      }
      // 选择模式：方向键直接搬动选中的那一段（左右 = 帧、上下 = 轨道）
      if (modeRef.current === "select" && selectionRef.current) {
        const dFrame =
          e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dTrack = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (dFrame !== 0 || dTrack !== 0) {
          e.preventDefault();
          moveSelection(dFrame, dTrack);
          return;
        }
      }
      if (modeRef.current === "record") {
        const key = recordKeyFor(e.key);
        if (key) {
          e.preventDefault();
          recordKey(key);
          return;
        }
        // Home/End/Delete 在两种模式下都一样；其余未映射的键（W/S/A/D…）交给时间轴
        if (
          e.key !== "Home" &&
          e.key !== "End" &&
          e.key !== "Delete" &&
          e.key !== "Backspace"
        ) {
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
  }, [
    copySelection,
    deleteSelection,
    moveCursor,
    moveSelection,
    pasteClipboard,
    recordKey,
    redo,
    stepTab,
    undo
  ]);

  // ---------------------------------------------------------------- 状态

  const totalSeconds = doc ? (doc.tas.frameCount * frameMs) / 1000 : 0;
  const fps = frameMs > 0 ? 1000 / frameMs : 0;
  /** 当前帧的按键（光标可能落在右侧余量里，那里没有数据）。 */
  const currentKeys =
    doc && cursor < doc.tas.frameCount ? doc.tas.keysAt(cursor) : [];
  const zoomPct = (cellW / DEFAULT_TAS_PREFS.cellW) * 100;
  const projectName = doc ? doc.name.replace(/\.tas$/i, "") : "";
  /** 文件列表按筛选词过滤（文件名，不区分大小写）。 */
  const visibleFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    return q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
  }, [files, fileFilter]);
  /** 游戏正在启动 / 正在关闭：这期间不能再点播放（Ballance 不支持多开）。 */
  const gameBusy = game.state === "launching" || game.state === "stopping";
  /** 回放目标帧率 = 录像帧率 × 速度倍率（0 = 不限速）。 */
  const targetFps = prefs.playSpeed > 0 ? fps * prefs.playSpeed : 0;
  targetFpsRef.current = targetFps;
  const speedLabel = (v: number) =>
    v > 0 ? `${Math.round(v * 100) / 100}×` : t("tas.speedUnlimited");
  /**
   * 速度滑条的档位下标。偏好里存的是倍率：不在档位上（老版本存的自定义值）就取对数距离
   * 最近的那一档显示；不限速永远是最后一档。
   */
  const speedStop = (() => {
    const exact = PLAY_SPEED_STOPS.indexOf(prefs.playSpeed);
    if (exact >= 0) return exact;
    let best = PLAY_SPEED_STOPS.indexOf(1);
    PLAY_SPEED_STOPS.forEach((v, i) => {
      if (v <= 0) return;
      const d = Math.abs(Math.log(v / prefs.playSpeed));
      if (d < Math.abs(Math.log(PLAY_SPEED_STOPS[best] / prefs.playSpeed)))
        best = i;
    });
    return best;
  })();
  /** 「播放」从哪一帧开始看（光标可能在右侧余量里，夹回录像范围）。 */
  const playFromFrame = doc
    ? Math.max(0, Math.min(cursor, doc.tas.frameCount - 1))
    : 0;
  const playLevel = projectName
    ? (prefs.projectLevels[projectName] ?? inferLevel(projectName))
    : null;
  /** 右上区域的 CSS 尺寸（物理像素 = 选定分辨率）。 */
  const regionCssW = prefs.gameWidth / dpr;
  const regionCssH = prefs.gameHeight / dpr;
  // 速度一改、或者游戏刚摆好（running），就把目标帧率推过去 —— 播放中调速靠这个即时生效
  useEffect(() => {
    if (game.state === "running" && sentFpsRef.current !== targetFps)
      void pushFrameLimit();
  }, [targetFps, game.state, pushFrameLimit]);

  /**
   * 上半区高度 = 游戏区域高度：**固定、不能拖**（拖高了游戏画面上下就有黑边，拖矮了画面被剪掉）。
   * 窗口太矮时给时间轴留出最小高度，游戏区域会被剪掉一截，下面会给提示。
   */
  const topH = Math.max(0, Math.min(regionCssH, winSize.h - TIMELINE_MIN_H));
  /** 窗口装不下这个区域时给个提示（不然游戏窗口会被剪掉一截）。 */
  const regionFits =
    topH >= regionCssH && regionCssW + 2 * SIDE_MIN_W <= winSize.w;
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
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {/* 标题栏（独立窗口：整条可拖拽 + 窗口按钮） */}
      <div
        className="flex h-11 shrink-0 items-stretch gap-3 border-b bg-background pr-1 pl-3"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <FileClock className="pointer-events-none size-4 text-muted-foreground" />
          <span className="pointer-events-none shrink-0 text-sm font-medium">
            {t("tas.title")}
          </span>
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

      <div className="flex min-h-0 flex-1 flex-col">
        {/* 上半区：文件列表 │ 游戏（居中，按分辨率 1:1）│ 控制面板。左右两栏等宽（flex-1 + basis-0），
            平分游戏以外的宽度 */}
        <div
          className="flex min-h-0 shrink-0 border-b"
          style={{ height: topH }}
        >
          {/* 左：TAS 目录里的文件（与右侧控制面板等宽） */}
          <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span
                className="truncate text-xs font-medium whitespace-nowrap text-muted-foreground"
                title={t("tas.openRecent")}
              >
                {t("tas.openRecent")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("tas.reload")}
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
            {/* 筛选：按文件名（不区分大小写） */}
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="h-7 pl-7 text-xs"
                  placeholder={t("tas.fileFilter")}
                  aria-label={t("tas.fileFilter")}
                  value={fileFilter}
                  onChange={e => setFileFilter(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      setFileFilter("");
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {!tasDir && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {t("tas.noInstance")}
                </p>
              )}
              {tasDir && files.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {t("tas.noFiles")}
                </p>
              )}
              {tasDir && files.length > 0 && visibleFiles.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {t("tas.fileFilterNone")}
                </p>
              )}
              {visibleFiles.map(file => {
                const path = `${tasDir}/${file.name}`;
                const active = doc?.path === path;
                const key = metaKey(file);
                const meta = fileMeta[key];
                return (
                  <button
                    key={file.name}
                    type="button"
                    title={file.name}
                    onClick={() => void open(path, file.name)}
                    className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                      active ? "bg-accent" : ""
                    }`}
                  >
                    <span
                      className={`truncate text-xs ${active ? "font-medium" : ""}`}
                    >
                      {file.name.replace(/\.tas$/i, "")}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground tabular-nums">
                      {key in fileMeta
                        ? meta
                          ? t("tas.fileMeta", {
                              frames: meta.frames.toLocaleString(),
                              fps: Math.round(meta.fps * 100) / 100,
                              time: formatFrameTime(meta.seconds)
                            })
                          : t("tas.fileMetaBroken")
                        : t("tas.fileMetaLoading")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 中：游戏视口（游戏窗口以「顶层窗口 + owner」摆在这块区域上，见 embed.rs）。宽度 = 分辨率，
                所以两侧等宽时游戏正好居中。所有按钮都在右侧控制面板：游戏窗口压在 HTML 上面，这里放控件也点不到。 */}
          <div
            className="flex min-h-0 shrink-0 flex-col border-l bg-neutral-950"
            style={{ width: regionCssW }}
          >
            {/* 游戏区域：物理像素尺寸 = 选定分辨率（CSS 尺寸再除以 dpr），游戏窗口被嵌在这个矩形里 */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <div
                ref={regionRef}
                className="relative flex shrink-0 items-center justify-center"
                style={{ width: regionCssW, height: regionCssH }}
              >
                {game.state === "running" ? (
                  // 游戏窗口已经嵌进这块区域了。它盖在 HTML 上面，所以这行字只在
                  // 「游戏还没出画面」时才看得到：一直黑的话至少知道不是界面卡死了。
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="max-w-[80%] text-center text-xs text-neutral-400">
                      {t("tas.gameRunningHint")}
                    </span>
                  </div>
                ) : (
                  <div className="flex max-w-[70%] flex-col items-center gap-3 text-center text-neutral-400">
                    {gameBusy ? (
                      <Loader2 className="size-8 animate-spin" />
                    ) : (
                      <Gamepad2 className="size-8 opacity-60" />
                    )}
                    <span className="text-xs">
                      {game.state === "launching"
                        ? t("tas.gameLaunching")
                        : game.state === "stopping"
                          ? t("tas.gameStopping")
                          : t("tas.gameAreaIdle")}
                    </span>
                    <span className="text-[11px] text-neutral-500 tabular-nums">
                      {`${prefs.gameWidth} × ${prefs.gameHeight}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右：控制面板 —— 所有功能按钮都在这里，按使用频率从上到下分组（与左侧文件列表等宽）。
              全部用 shadcn 组件：Card 分组、Label + Input/Select、ToggleGroup / Toggle、Badge、Alert */}
          <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3 overflow-y-auto border-l bg-muted/30 p-3">
            {/* ── 回放：播放 / 速度 / 关卡 / 分辨率（游戏区域上面不放任何按钮） ── */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clapperboard className="size-4 text-muted-foreground" />
                  {t("tas.sectionPlayback")}
                </CardTitle>
                <CardAction>
                  <Badge
                    variant="outline"
                    className="gap-1.5 font-normal tabular-nums"
                    title={t("tas.speedMeasuredHint")}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        game.state === "running"
                          ? "bg-emerald-500"
                          : gameBusy
                            ? "animate-pulse bg-amber-500"
                            : "bg-muted-foreground/40"
                      )}
                    />
                    {game.state === "running"
                      ? measuredFps !== null
                        ? `${t("tas.gameStateRunning")} · ${t("tas.speedMeasured", { fps: Math.round(measuredFps) })}`
                        : t("tas.gameStateRunning")
                      : game.state === "launching"
                        ? t("tas.gameStateLaunching")
                        : game.state === "stopping"
                          ? t("tas.gameStateStopping")
                          : t("tas.gameStateIdle")}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                {/* 游戏在跑时再点 = 改配置 + 重启（TAS 配置只在启动时读），会先问一句 */}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button
                    disabled={!doc || busy || gameBusy}
                    title={t("tas.playFromCursorHint", {
                      frame: playFromFrame.toLocaleString()
                    })}
                    onClick={() => void playProject(false)}
                  >
                    {gameBusy ? <Loader2 className="animate-spin" /> : <Play />}
                    <span className="truncate">
                      {t("tas.gamePlay")}
                      <span className="ml-1.5 font-normal opacity-75 tabular-nums">
                        {t("tas.playFromFrameShort", {
                          frame: playFromFrame.toLocaleString()
                        })}
                      </span>
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!doc || busy || gameBusy}
                    title={t("tas.playFromStartHint")}
                    onClick={() => void playProject(true)}
                  >
                    <SkipBack />
                    {t("tas.playFromStart")}
                  </Button>
                </div>
                {game.state === "running" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void stopGame()}
                    >
                      <Square />
                      {t("tas.gameStop")}
                    </Button>
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={interactive}
                      onPressedChange={() => void toggleInteractive()}
                      title={t("tas.gameInteractiveHint")}
                    >
                      <MousePointerClick />
                      {t("tas.gameInteractive")}
                    </Toggle>
                  </div>
                )}

                {/* 速度：滑条按档位走；拖动中每一档都即时推给游戏（RockoonIO 限速，下一帧生效） */}
                <div className="grid gap-1.5">
                  <Label htmlFor="tas-speed" title={t("tas.speedHint")}>
                    {t("tas.speedShort")}
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      id="tas-speed"
                      className="min-w-0 flex-1"
                      min={0}
                      max={PLAY_SPEED_STOPS.length - 1}
                      step={1}
                      value={[speedStop]}
                      onValueChange={([i]) => setPlaySpeed(PLAY_SPEED_STOPS[i])}
                      aria-label={t("tas.speed")}
                      title={t("tas.speedHint")}
                    />
                    {/* 点一下回到 1× */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto w-16 flex-col items-end gap-0 px-1.5 py-0.5"
                      title={t("tas.speedResetHint")}
                      onClick={() => setPlaySpeed(1)}
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        {speedLabel(prefs.playSpeed)}
                      </span>
                      <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                        {targetFps > 0
                          ? `${Math.round(targetFps)} fps`
                          : "∞ fps"}
                      </span>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 一键播放后自动进入的关卡（BallanceTAS 的 Startup.Level），按项目记住 */}
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="tas-level" title={t("tas.gameLevelHint")}>
                      {t("tas.gameLevel")}
                    </Label>
                    <Select
                      value={playLevel ? String(playLevel) : ""}
                      onValueChange={value => {
                        if (projectName)
                          setProjectLevel(projectName, Number(value));
                      }}
                      disabled={!doc}
                    >
                      <SelectTrigger
                        id="tas-level"
                        size="sm"
                        className="w-full"
                        title={t("tas.gameLevelHint")}
                      >
                        <SelectValue placeholder={t("tas.gameLevelPick")} />
                      </SelectTrigger>
                      <SelectContent>
                        {TAS_LEVELS.map(n => (
                          <SelectItem key={n} value={String(n)}>
                            {t("tas.levelN", { n })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* 分辨率在启动时用 -w/-h 定死，游戏跑着时不能改 */}
                  <div className="grid min-w-0 gap-1.5">
                    <Label
                      htmlFor="tas-resolution"
                      title={t("tas.gameResolutionHint")}
                    >
                      {t("tas.gameResolution")}
                    </Label>
                    <Select
                      value={`${prefs.gameWidth}x${prefs.gameHeight}`}
                      onValueChange={value => {
                        const [w, h] = value.split("x").map(Number);
                        persistPrefs({
                          ...prefsRef.current,
                          gameWidth: w,
                          gameHeight: h
                        });
                      }}
                      disabled={game.state !== "idle"}
                    >
                      <SelectTrigger
                        id="tas-resolution"
                        size="sm"
                        className="w-full"
                        title={t("tas.gameResolutionHint")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GAME_RESOLUTIONS.map(([w, h]) => (
                          <SelectItem key={`${w}x${h}`} value={`${w}x${h}`}>
                            {`${w} × ${h}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!regionFits && (
                  <Alert title={t("tas.gameTooSmallHint")}>
                    <TriangleAlert />
                    <AlertDescription>{t("tas.gameTooSmall")}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* ── 文件 ── */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  {t("tas.sectionFile")}
                </CardTitle>
                {doc && (
                  <CardAction>
                    <Badge variant={dirty ? "secondary" : "outline"}>
                      {dirty ? t("tas.modified") : t("tas.clean")}
                    </Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!doc || !dirty || busy}
                    title="Ctrl+S"
                    onClick={() => void save(false)}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Save />}
                    {t("tas.save")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!doc || busy}
                    title="Ctrl+Shift+S"
                    onClick={() => void save(true)}
                  >
                    {t("tas.saveAs")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title={t("tas.trimTailHint")}
                    disabled={!doc}
                    onClick={trimTailCmd}
                  >
                    <Scissors />
                    {t("tas.trimTail")}
                  </Button>
                </div>
                {status && (
                  <p className="truncate text-xs text-muted-foreground">
                    {status}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── 编辑：鼠标模式 + 撤销重做 ── */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <PencilLine className="size-4 text-muted-foreground" />
                  {t("tas.sectionEdit")}
                </CardTitle>
                <CardAction className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={`${t("tas.undo")} (Ctrl+Z)`}
                    disabled={!undoState.canUndo}
                    onClick={undo}
                  >
                    <Undo2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={`${t("tas.redo")} (Ctrl+Shift+Z)`}
                    disabled={!undoState.canRedo}
                    onClick={redo}
                  >
                    <Redo2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-4">
                {/* 鼠标模式四选一：选择 / 绘制 / 填充 / 录入（快捷键 1~4） */}
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  value={mode}
                  onValueChange={value => {
                    // 单选组再点一下当前项会传空串：保持当前模式
                    if (!value) return;
                    recordRoundRef.current = null;
                    setMode(value as TasMouseMode);
                  }}
                  disabled={!doc}
                  aria-label={t("tas.mode")}
                >
                  {MOUSE_MODES.map(m => (
                    <ToggleGroupItem
                      key={m.id}
                      value={m.id}
                      className="flex-1"
                      title={`${t(m.hintKey)} (${m.key})`}
                    >
                      <span className="text-[10px] opacity-60">{m.key}</span>
                      {t(m.labelKey)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </CardContent>
            </Card>

            {/* ── 帧：当前帧 / 按键时长 / 录像帧率 + 本帧按键 ── */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Hash className="size-4 text-muted-foreground" />
                  {t("tas.sectionFrame")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <div className="grid grid-cols-3 gap-3">
                  {/* 当前帧：实时跟着光标走；输入帧号 + Enter / 失焦就跳过去 */}
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="tas-frame">{t("tas.currentFrame")}</Label>
                    <Input
                      id="tas-frame"
                      type="text"
                      inputMode="numeric"
                      className="h-8 tabular-nums"
                      disabled={!doc}
                      value={frameFocus ? frameText : String(cursor)}
                      onFocus={() => {
                        setFrameText(String(cursor));
                        setFrameFocus(true);
                      }}
                      onChange={e => setFrameText(e.target.value)}
                      onBlur={() => {
                        setFrameFocus(false);
                        const raw = frameText.trim();
                        const n = Number(raw);
                        const d = docRef.current;
                        if (raw === "" || !Number.isInteger(n) || !d) return; // 非法：恢复成当前值
                        moveCursor(
                          Math.max(0, Math.min(d.tas.frameCount - 1, n)),
                          false
                        );
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </div>
                  {/* 选择模式：选中一段按键后，这里直接显示/修改它的帧数 */}
                  <div className="grid min-w-0 gap-1.5">
                    <Label
                      htmlFor="tas-run-length"
                      title={t("tas.runLengthHint")}
                    >
                      {t("tas.runLength")}
                    </Label>
                    <Input
                      id="tas-run-length"
                      ref={lenInputRef}
                      type="text"
                      inputMode="numeric"
                      className="h-8 tabular-nums"
                      title={t("tas.runLengthHint")}
                      disabled={
                        !doc || !selection || selection.t0 !== selection.t1
                      }
                      value={lenFocus ? lenText : String(selectionLength)}
                      onFocus={() => {
                        setLenText(String(selectionLength));
                        setLenFocus(true);
                      }}
                      onChange={e => applyRunLength(e.target.value)}
                      onBlur={() => setLenFocus(false)}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </div>
                  {/* 帧率：全局统一，改它 = 把每一帧都写成 1000/fps 毫秒（不支持变速） */}
                  <div className="grid min-w-0 gap-1.5">
                    <Label
                      htmlFor="tas-record-fps"
                      title={t("tas.recordFpsHint")}
                    >
                      {t("tas.recordFps")}
                    </Label>
                    <Input
                      id="tas-record-fps"
                      type="text"
                      inputMode="decimal"
                      className="h-8 tabular-nums"
                      title={t("tas.recordFpsHint")}
                      disabled={!doc}
                      value={fpsFocus ? fpsText : msToText(fps)}
                      onFocus={() => {
                        setFpsText(msToText(fps));
                        setFpsFocus(true);
                      }}
                      onChange={e => setFpsText(e.target.value)}
                      onBlur={() => {
                        setFpsFocus(false);
                        const raw = fpsText.trim();
                        const n = Number(raw);
                        if (raw !== "" && Number.isFinite(n) && n > 0)
                          applyFrameMs(1000 / n);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </div>
                </div>
                {/* 当前帧的按键一眼可见（录入模式尤其需要） */}
                <div
                  className="flex min-w-0 flex-wrap items-center gap-1.5"
                  aria-label={t("tas.frameKeys")}
                >
                  <Label className="mr-1">{t("tas.frameKeys")}</Label>
                  {currentKeys.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t("tas.noKeys")}
                    </span>
                  ) : (
                    currentKeys.map(key => (
                      <Badge key={key} variant="outline" className="gap-1.5">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: trackColor(key, dark) }}
                        />
                        {KEY_META[key].short}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── 视图：网格开关 + 缩放 ── */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Eye className="size-4 text-muted-foreground" />
                  {t("tas.sectionView")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 px-4">
                {/* 纵线 / 横线 / 分区：三个互相独立的开关 */}
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  value={GRID_TOGGLES.filter(g => prefs[g.key]).map(g => g.key)}
                  onValueChange={values =>
                    persistPrefs({
                      ...prefsRef.current,
                      vGrid: values.includes("vGrid"),
                      hGrid: values.includes("hGrid"),
                      bands: values.includes("bands")
                    })
                  }
                  disabled={!doc}
                >
                  {GRID_TOGGLES.map(g => (
                    <ToggleGroupItem
                      key={g.key}
                      value={g.key}
                      title={t(g.hintKey)}
                    >
                      {t(g.labelKey)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={`${t("tas.zoomOut")} (S)`}
                    disabled={!doc}
                    onClick={() => timelineRef.current?.zoomStep(-1)}
                  >
                    <ZoomOut />
                  </Button>
                  <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
                    {zoomText}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={`${t("tas.zoomIn")} (W)`}
                    disabled={!doc}
                    onClick={() => timelineRef.current?.zoomStep(1)}
                  >
                    <ZoomIn />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={t("tas.zoomFit")}
                    disabled={!doc}
                    onClick={() => timelineRef.current?.fitAll()}
                  >
                    <Maximize2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 下半区：时间轴 + 说明条 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!doc ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {t("tas.hint")}
            </div>
          ) : (
            <TasTimeline
              ref={timelineRef}
              tas={doc.tas}
              frameMs={frameMs}
              blockLabel={(n: number) => t("tas.blockFrames", { n })}
              order={order}
              dark={dark}
              vGrid={prefs.vGrid}
              hGrid={prefs.hGrid}
              bands={prefs.bands}
              mode={mode}
              onMenu={at => setMenu(at)}
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
                // 来自时间轴的选区（单击/框选）不是打字造成的，取消待消费的标记，保证自动聚焦生效
                lenTypingRef.current = false;
                selectionRef.current = sel;
                setSelection(sel);
                // 选区被拖起来的那一刻定下锚点，之后一直用它
                if (sel && selAnchorRef.current === null)
                  selAnchorRef.current = sel.f0;
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
              recording={mode === "record"}
              onToggleLock={toggleLock}
            />
          )}

          {/* 时间轴右键菜单（只在选择模式弹） */}
          <DropdownMenu
            open={menu !== null}
            onOpenChange={open => !open && setMenu(null)}
          >
            <DropdownMenuTrigger asChild>
              <span
                aria-hidden
                className="pointer-events-none fixed z-50 size-0"
                style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={4}
              className="w-52"
              onCloseAutoFocus={e => e.preventDefault()}
            >
              <DropdownMenuItem disabled={!menuHasRun} onSelect={selectRunAt}>
                {t("tas.menu.selectRun")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  if (!menu) return;
                  const d = docRef.current;
                  const max = Math.max(0, (d?.tas.frameCount ?? 1) - 1);
                  moveCursor(Math.min(max, Math.max(0, menu.frame)), false);
                }}
              >
                {t("tas.menu.jumpHere")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!menuHasRun}
                onSelect={() => copySelection(false)}
              >
                {t("tas.menu.copy")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!menuHasRun}
                onSelect={() => copySelection(true)}
              >
                {t("tas.menu.cut")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!clipRef.current}
                onSelect={() => pasteClipboard(false)}
              >
                {t("tas.menu.paste")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!menuHasRun}
                onSelect={deleteSelection}
              >
                {t("tas.menu.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TasHintBar mode={mode} />
        </div>
      </div>

      {/* 一键播放的确认框：改配置 / 重启游戏（同一个框，两种文案）。
          `z-[51]` 不能省：上一个框刚关、同一个 radix 实例又被重新打开时，
          它会把遮罩插到内容**后面**（同为 z-50，后插入者压在上面）→ 弹窗就点不动了。 */}
      <AlertDialog
        open={playAsk !== null}
        onOpenChange={open => {
          if (!open) answerPlay(false);
        }}
      >
        <AlertDialogContent className="z-[51]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {playAsk?.kind === "restart"
                ? t("tas.playRestartTitle")
                : t("tas.playConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {playAsk?.kind === "restart"
                ? t("tas.playRestartBody")
                : t("tas.playConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {playAsk?.kind === "config" && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {playAsk.changes.map(c => (
                <li key={`${c.category}.${c.name}`}>{describeChange(c)}</li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => answerPlay(true)}>
              {playAsk?.kind === "restart"
                ? t("tas.playRestart")
                : t("tas.playConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 关窗时：游戏还嵌在里面跑，问一下怎么处置 */}
      <AlertDialog
        open={closeAsk}
        onOpenChange={open => {
          if (open) return;
          setCloseAsk(false);
          const resolve = closeAnswerRef.current;
          closeAnswerRef.current = null;
          resolve?.("cancel");
        }}
      >
        <AlertDialogContent className="z-[51]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tas.closeGameTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tas.closeGameBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.dialog.cancel")}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const resolve = closeAnswerRef.current;
                closeAnswerRef.current = null;
                setCloseAsk(false);
                resolve?.("keep");
              }}
            >
              {t("tas.closeGameKeep")}
            </Button>
            <AlertDialogAction
              onClick={() => {
                const resolve = closeAnswerRef.current;
                closeAnswerRef.current = null;
                setCloseAsk(false);
                resolve?.("kill");
              }}
            >
              {t("tas.closeGameKill")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
