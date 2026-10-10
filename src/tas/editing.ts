/**
 * TAS 编辑器的**纯数据操作**（不碰 DOM，可以在 node 里直接跑）。
 *
 * 这里放的都是「编辑语义」：抓取横向连通块、合并区块、选区归一化、剪贴板、
 * 尾部自动加长、全局帧时长、撤销栈。视图层（canvas）只调用这些函数，
 * 不自己算这些规则 —— 这样规则可以用 `.local-logs/tas-logic-test.ts` 单独验证。
 */

import {
  FRAME_SIZE,
  KEY_BITS,
  keyMask,
  type TasFile,
  type TasKey
} from "./format";

/** 全部按键的掩码（判断「这一帧有没有按键」用）。 */
export const ALL_KEYS_MASK = (1 << KEY_BITS.length) - 1;

/**
 * 编辑到末尾时向右留出的余量（帧）。
 * 绘制到接近末尾就把数据加长这么多，免得画一帧就要重算一次长度。
 */
export const GROW_MARGIN_FRAMES = 120;

// ---------------------------------------------------------------- 读位：一次 DataView，避免每格 new

/** 帧数据的 DataView。内层循环（渲染、扫描）每次 `new DataView` 太浪费，统一走这里。 */
export function frameView(tas: TasFile): DataView {
  return new DataView(
    tas.data.buffer,
    tas.data.byteOffset,
    tas.data.byteLength
  );
}

/**
 * 第 frame 帧的 keystates（越界返回 0）。
 * 右端越界也要挡：光标 / 选区可以落在数据末尾之后的「可编辑余量」里（paintableFrames），
 * DataView 读到外面会抛 RangeError —— 在渲染里调用的话整个编辑器就崩了。
 */
export function keystatesAt(view: DataView, frame: number): number {
  const at = frame * FRAME_SIZE + 4;
  return frame < 0 || at + 4 > view.byteLength ? 0 : view.getUint32(at, true);
}

/** 这一帧有没有任何按键。 */
export function anyKeyAt(view: DataView, frame: number): boolean {
  return (keystatesAt(view, frame) & ALL_KEYS_MASK) !== 0;
}

/** 这一帧某个键是否按下。 */
export function hasKeyAt(view: DataView, frame: number, key: TasKey): boolean {
  return (keystatesAt(view, frame) & keyMask(key)) !== 0;
}

/** 文件里最后一个有按键的帧；全是空帧返回 -1。 */
export function lastKeyedFrame(tas: TasFile): number {
  const view = frameView(tas);
  for (let f = tas.frameCount - 1; f >= 0; f--) if (anyKeyAt(view, f)) return f;
  return -1;
}

/** 文件里第一个有按键的帧；全是空帧返回 0（打开文件时光标落在这里）。 */
export function firstPressedFrame(tas: TasFile): number {
  const view = frameView(tas);
  for (let f = 0; f < tas.frameCount; f++) {
    if ((view.getUint32(f * FRAME_SIZE + 4, true) & ALL_KEYS_MASK) !== 0)
      return f;
  }
  return 0;
}

// ---------------------------------------------------------------- 区块

/**
 * 抓取 `(frame, key)` 所在的**横向连通块**：向左右扩展，返回闭区间 `[start, end]`。
 * 该格为空（或越界）时返回 null —— Alt 拖拽用它决定「抓住的是哪一块」。
 */
export function grabRun(
  tas: TasFile,
  frame: number,
  key: TasKey
): [number, number] | null {
  const view = frameView(tas);
  if (frame < 0 || frame >= tas.frameCount || !hasKeyAt(view, frame, key))
    return null;
  let start = frame;
  while (start > 0 && hasKeyAt(view, start - 1, key)) start--;
  let end = frame;
  while (end + 1 < tas.frameCount && hasKeyAt(view, end + 1, key)) end++;
  return [start, end];
}

/**
 * 把 `[f0,f1]` 选区里 `key` 的按键设成**恰好 `length` 帧**（`length = 0` = 删掉选区内这一段）。
 * 选区外的数据一概不动 —— 选中一整段时这就是「改这段的时长」，框住其中一部分时
 * 只是把那一部分伸缩/切断（改小会在该段中间留一个空档，那是预期的）。
 * `length` 超过选区长度时多出来的帧会伸到选区右侧（空选区上就是从 0 新建按键）。
 */
export function setRunLength(
  tas: TasFile,
  f0: number,
  f1: number,
  key: TasKey,
  length: number,
  deltaMs: number
): boolean {
  if (f0 < 0 || f0 >= tas.frameCount) return false;
  const targetEnd = length > 0 ? f0 + length - 1 : f0 - 1;
  // 要归位的范围 = 选区 ∪ 目标段，多出来的尾巴得清掉
  const end = Math.max(f1, targetEnd, f0);
  if (end >= tas.frameCount) growToFit(tas, end, deltaMs);
  const view = frameView(tas);
  const mask = keyMask(key);
  let changed = false;
  const stop = Math.min(end, tas.frameCount - 1);
  for (let f = f0; f <= stop; f++) {
    const want = length > 0 && f <= targetEnd;
    const states = view.getUint32(f * FRAME_SIZE + 4, true);
    if (want !== ((states & mask) !== 0)) {
      view.setUint32(
        f * FRAME_SIZE + 4,
        (want ? states | mask : states & ~mask) >>> 0,
        true
      );
      changed = true;
    }
  }
  return changed;
}

/**
 * 选择模式「框选」用：把拖出的帧区间 `[fa,fb]`（同一行内）收拢成**一段连续按下的帧**。
 * - 锚点那格有按键 → 取包含锚点的那一段与该区间的交集（= 框住整段的一部分）；
 * - 锚点是空格、区间内别处有按键 → 取区间内离锚点最近的那一段；
 * - 区间里一点按键都没有 → 原样返回（时长 0，用户可以把时长改成 >0 在此新建按键）。
 */
export function snapDragToRun(
  tas: TasFile,
  key: TasKey,
  anchorFrame: number,
  fa: number,
  fb: number
): [number, number] {
  const a = Math.max(0, Math.min(fa, fb));
  const b = Math.min(Math.max(fa, fb), tas.frameCount - 1);
  if (b < a) return [a, a];
  const view = frameView(tas);
  const mask = keyMask(key);
  const on = (f: number) =>
    (view.getUint32(f * FRAME_SIZE + 4, true) & mask) !== 0;
  const anchor = Math.max(a, Math.min(anchorFrame, b));
  let seed = anchor;
  if (!on(seed)) {
    seed = -1;
    for (let f = anchor + 1; f <= b && seed < 0; f++) if (on(f)) seed = f;
    for (let f = anchor - 1; f >= a && seed < 0; f--) if (on(f)) seed = f;
    if (seed < 0) return [a, b];
  }
  const run = grabRun(tas, seed, key);
  if (!run) return [a, b];
  return [Math.max(a, run[0]), Math.min(b, run[1])];
}
/**
 * 跳到方向 `dir`（-1 左 / +1 右）上最近的**按键段边缘**：把所有轨道的每段起点与末帧
 * 放在一起看，取帧号距 `frame` 最近的那个。没有可跳的就返回 null。
 */
export function jumpRunEdge(
  tas: TasFile,
  tracks: TasKey[],
  frame: number,
  dir: -1 | 1
): number | null {
  let best: number | null = null;
  for (const key of tracks) {
    for (const [start, end] of collectRuns(tas, key, 0, tas.frameCount)) {
      for (const edge of [start, end]) {
        if (dir > 0 ? edge <= frame : edge >= frame) continue;
        if (best === null || (dir > 0 ? edge < best : edge > best)) best = edge;
      }
    }
  }
  return best;
}

/**
 * 渲染用：把 `[from, to)` 里命中的帧合并成区块（闭区间）。
 * 「同轨道连续帧合并成胶囊」就是靠它，一次扫描不重复走位。
 */
export function collectRuns(
  tas: TasFile,
  key: TasKey,
  from: number,
  to: number
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  const view = frameView(tas);
  const mask = keyMask(key);
  const begin = Math.max(0, from);
  // 末尾余量里没有数据，别读到数据外面去（DataView 越界会抛）
  const stop = Math.min(to, tas.frameCount);
  let start = -1;
  for (let f = begin; f < stop; f++) {
    const on = (view.getUint32(f * FRAME_SIZE + 4, true) & mask) !== 0;
    if (on) {
      if (start < 0) start = f;
    } else if (start >= 0) {
      runs.push([start, f - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, stop - 1]);
  return runs;
}

// ---------------------------------------------------------------- 选择模式

/** 选区 = 帧区间 × 轨道下标区间（闭区间，已归一化）。 */
export type TasSelection = { f0: number; f1: number; t0: number; t1: number };

/** 「没有轨道被锁」的默认值：省得每个调用点都造一个空 Set。 */
const NO_LOCKS: ReadonlySet<TasKey> = new Set<TasKey>();

/**
 * 录入模式的「**完全覆盖**」：把 `[f0,f1]` 区间上所有**非锁定**轨道先清空，
 * 再逐帧置位 `keys` 里的键。锁定轨道原样不动。
 * 一次按键 = 一轮覆盖；同一帧内继续按键就把新键加进 `keys` 再来一遍（= 累加）。
 */
export function coverRange(
  tas: TasFile,
  f0: number,
  f1: number,
  keys: TasKey[],
  tracks: TasKey[],
  locked: ReadonlySet<TasKey> = NO_LOCKS,
  deltaMs = tas.commonDeltaTime
): boolean {
  const editable = tracks.filter(key => !locked.has(key));
  if (editable.length === 0 || f1 < 0) return false;
  const from = Math.max(0, f0);
  if (f1 >= tas.frameCount) growToFit(tas, f1, deltaMs);
  let changed = false;
  for (let f = from; f <= f1 && f < tas.frameCount; f++) {
    for (const key of editable) {
      if (paintCell(tas, f, key, keys.includes(key))) changed = true;
    }
  }
  return changed;
}

/**
 * 整段平移 `delta` 帧（选区“整段”）：`[f0,f1]` 的内容整体搬到 `[f0+delta, f1+delta]`，
 * 腾空的边缘帧清空（内容不复制、不循环）。锁定轨道完全不动。
 */
export function shiftRange(
  tas: TasFile,
  sel: TasSelection,
  delta: number,
  tracks: TasKey[],
  locked: ReadonlySet<TasKey> = NO_LOCKS,
  deltaMs = tas.commonDeltaTime
): boolean {
  const d = Math.max(delta, -sel.f0);
  if (d === 0) return false;
  const editable = tracks.filter(key => !locked.has(key));
  if (editable.length === 0) return false;
  const { f0, f1 } = sel;
  const lo = Math.max(0, Math.min(f0, f0 + d));
  const hi = Math.max(f1, f1 + d);
  const view = frameView(tas);
  // 先把源块整个读出来：同一段内平移，边写边读会丢数据
  const src = new Map<TasKey, boolean[]>();
  for (const key of editable) {
    const mask = keyMask(key);
    const bits: boolean[] = [];
    for (let f = f0; f <= f1; f++) {
      bits.push(
        f >= 0 &&
          f < tas.frameCount &&
          (view.getUint32(f * FRAME_SIZE + 4, true) & mask) !== 0
      );
    }
    src.set(key, bits);
  }
  if (hi >= tas.frameCount) growToFit(tas, hi, deltaMs);
  const after = frameView(tas);
  let changed = false;
  for (const key of editable) {
    const mask = keyMask(key);
    const bits = src.get(key) as boolean[];
    for (let f = lo; f <= hi && f < tas.frameCount; f++) {
      const i = f - d - f0;
      const want = i >= 0 && i < bits.length ? bits[i] : false;
      const states = after.getUint32(f * FRAME_SIZE + 4, true);
      if (want !== ((states & mask) !== 0)) {
        after.setUint32(
          f * FRAME_SIZE + 4,
          (want ? states | mask : states & ~mask) >>> 0,
          true
        );
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * 「填充模式」：把一个矩形 `[f0,f1] × [t0,t1]`（轨道下标闭区间）整块置位/清除。
 * 左键 = 全部置位、右键 = 全部清除；锁定轨道跳过。
 */
export function fillRange(
  tas: TasFile,
  f0: number,
  f1: number,
  t0: number,
  t1: number,
  tracks: TasKey[],
  value: boolean,
  locked: ReadonlySet<TasKey> = NO_LOCKS,
  deltaMs = tas.commonDeltaTime
): boolean {
  const from = Math.max(0, Math.min(f0, f1));
  const rawTo = Math.max(f0, f1);
  if (rawTo < from) return false;
  if (!value)
    return clearRange(tas, { f0: from, f1: rawTo, t0, t1 }, tracks, locked);
  if (rawTo >= tas.frameCount) growToFit(tas, rawTo, deltaMs);
  const to = Math.min(rawTo, tas.frameCount - 1);
  let changed = false;
  for (let t = t0; t <= t1; t++) {
    const key = tracks[t];
    if (!key || locked.has(key)) continue;
    for (let f = from; f <= to; f++) {
      if (paintCell(tas, f, key, true)) changed = true;
    }
  }
  return changed;
}

/** 归一化：不管从哪个角开始拖，都变成 f0<=f1、t0<=t1。 */
export function normalizeSelection(
  fa: number,
  ta: number,
  fb: number,
  tb: number
): TasSelection {
  return {
    f0: Math.max(0, Math.min(fa, fb)),
    f1: Math.max(0, Math.max(fa, fb)),
    t0: Math.min(ta, tb),
    t1: Math.max(ta, tb)
  };
}

// ---------------------------------------------------------------- 长度 / 时长

/** 补空帧到 `frames` 帧（新帧 deltaTime = deltaMs、无按键）。返回是否加长了。 */
export function ensureFrames(
  tas: TasFile,
  frames: number,
  deltaMs: number
): boolean {
  if (frames <= tas.frameCount) return false;
  const next = new Uint8Array(frames * FRAME_SIZE);
  next.set(tas.data, 0);
  const view = new DataView(next.buffer);
  for (let f = tas.frameCount; f < frames; f++)
    view.setFloat32(f * FRAME_SIZE, deltaMs, true);
  tas.data = next;
  return true;
}

/** 编辑到 `frame` 之后自动加长：新长度 = max(现有, frame + 1 + 余量)。 */
export function growToFit(
  tas: TasFile,
  frame: number,
  deltaMs: number
): boolean {
  return ensureFrames(tas, frame + 1 + GROW_MARGIN_FRAMES, deltaMs);
}

/** 显式裁掉尾部空帧（返回裁掉了几帧）。保存不会自动裁尾，只有这个命令会。 */
export function trimTail(tas: TasFile): number {
  const last = lastKeyedFrame(tas);
  const keep = Math.max(1, last + 1);
  const removed = tas.frameCount - keep;
  if (removed <= 0) return 0;
  tas.data = tas.data.slice(0, keep * FRAME_SIZE);
  return removed;
}

/** 全局统一帧时长：把每一帧都写成同一个值（编辑器不支持逐帧不同）。 */
export function setFrameDuration(tas: TasFile, ms: number): void {
  const view = frameView(tas);
  for (let f = 0; f < tas.frameCount; f++)
    view.setFloat32(f * FRAME_SIZE, ms, true);
}

/** 涂改一格；返回是否真的改了数据（没变就不算一次编辑）。 */
export function paintCell(
  tas: TasFile,
  frame: number,
  key: TasKey,
  down: boolean
): boolean {
  if (frame < 0 || frame >= tas.frameCount) return false;
  if (tas.getKey(frame, key) === down) return false;
  tas.setKey(frame, key, down);
  return true;
}

// ---------------------------------------------------------------- 剪贴板

/** 剪贴板：按轨道存，粘贴时按**键名**对齐（不依赖当时的轨道顺序）。 */
export type TasClip = { width: number; tracks: TasKey[]; cells: Uint8Array };

/** 复制帧区间 `[from, to]`（闭区间）在给定轨道上的内容。 */
export function copyRange(
  tas: TasFile,
  tracks: TasKey[],
  from: number,
  to: number
): TasClip {
  const width = Math.max(1, to - from + 1);
  const cells = new Uint8Array(width * tracks.length);
  const view = frameView(tas);
  tracks.forEach((key, t) => {
    const mask = keyMask(key);
    for (let i = 0; i < width; i++) {
      const f = from + i;
      if (
        f >= 0 &&
        f < tas.frameCount &&
        (view.getUint32(f * FRAME_SIZE + 4, true) & mask) !== 0
      ) {
        cells[t * width + i] = 1;
      }
    }
  });
  return { width, tracks: [...tracks], cells };
}

function blankFrames(count: number, deltaMs: number): Uint8Array {
  const bytes = new Uint8Array(count * FRAME_SIZE);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++)
    view.setFloat32(i * FRAME_SIZE, deltaMs, true);
  return bytes;
}

/**
 * 粘贴：
 * - `overwrite`：从 atFrame 起覆盖同样多帧（超出末尾自动加长）。
 * - `insert`：先在 atFrame 插入同宽的空帧（整条时间轴右移，不只是剪贴板里的轨道），再写入。
 *
 * 返回粘贴到的帧区间（闭区间），调用方拿它更新光标/选区。
 */
export function pasteClip(
  tas: TasFile,
  clip: TasClip,
  atFrame: number,
  deltaMs: number,
  mode: "overwrite" | "insert" = "overwrite",
  locked: ReadonlySet<TasKey> = NO_LOCKS
): [number, number] {
  const frame = Math.max(0, atFrame);
  if (mode === "insert") {
    tas.pasteFrames(frame, blankFrames(clip.width, deltaMs), "insert");
  } else {
    ensureFrames(tas, frame + clip.width, deltaMs);
  }
  const view = frameView(tas);
  clip.tracks.forEach((key, t) => {
    if (locked.has(key)) return;
    const mask = keyMask(key);
    for (let i = 0; i < clip.width; i++) {
      const f = frame + i;
      if (f >= tas.frameCount) break;
      const states = view.getUint32(f * FRAME_SIZE + 4, true);
      const want = clip.cells[t * clip.width + i] === 1;
      const is = (states & mask) !== 0;
      if (want !== is)
        view.setUint32(
          f * FRAME_SIZE + 4,
          (want ? states | mask : states & ~mask) >>> 0,
          true
        );
    }
  });
  return [frame, frame + clip.width - 1];
}

/** 清空选区内容（`locked` 里的轨道不动）。返回是否真的改了数据。 */
export function clearRange(
  tas: TasFile,
  sel: TasSelection,
  tracks: TasKey[],
  locked: ReadonlySet<TasKey> = NO_LOCKS
): boolean {
  const view = frameView(tas);
  let changed = false;
  for (let t = sel.t0; t <= sel.t1; t++) {
    const key = tracks[t];
    if (!key || locked.has(key)) continue;
    const mask = keyMask(key);
    for (let f = sel.f0; f <= sel.f1 && f < tas.frameCount; f++) {
      const states = view.getUint32(f * FRAME_SIZE + 4, true);
      if ((states & mask) !== 0) {
        view.setUint32(f * FRAME_SIZE + 4, (states & ~mask) >>> 0, true);
        changed = true;
      }
    }
  }
  return changed;
}

/** 把一整块（单轨道、一段帧）搬到另一个轨道/位置。重叠处按「后写入者覆盖」。 */
export function moveBlock(
  tas: TasFile,
  from: [number, number],
  fromTrack: number,
  toFrame: number,
  toTrack: number,
  tracks: TasKey[],
  deltaMs: number
): boolean {
  const srcTrack = tracks[fromTrack];
  const dstTrack = tracks[toTrack];
  const width = from[1] - from[0] + 1;
  if (!srcTrack || !dstTrack || toFrame < 0) return false;
  const view = frameView(tas);
  const srcMask = keyMask(srcTrack);
  const dstMask = keyMask(dstTrack);
  // 先按位把源块拷出来（同一轨道内搬动时，先擦后写就丢了）
  const bits: boolean[] = [];
  for (let i = 0; i < width; i++) {
    const f = from[0] + i;
    bits.push(
      f < tas.frameCount &&
        (view.getUint32(f * FRAME_SIZE + 4, true) & srcMask) !== 0
    );
  }
  ensureFrames(tas, toFrame + width, deltaMs);
  const after = frameView(tas);
  for (let i = 0; i < width; i++) {
    const f = from[0] + i;
    if (f >= tas.frameCount) break;
    const states = after.getUint32(f * FRAME_SIZE + 4, true);
    after.setUint32(f * FRAME_SIZE + 4, (states & ~srcMask) >>> 0, true);
  }
  for (let i = 0; i < width; i++) {
    const f = toFrame + i;
    if (f >= tas.frameCount) break;
    const states = after.getUint32(f * FRAME_SIZE + 4, true);
    after.setUint32(
      f * FRAME_SIZE + 4,
      (bits[i] ? states | dstMask : states & ~dstMask) >>> 0,
      true
    );
  }
  return true;
}

// ---------------------------------------------------------------- 撤销栈

/** 一步撤销 = 一次完整操作（一次拖拽、一次粘贴…）。用整段帧数据快照实现。 */
export type UndoEntry = { data: Uint8Array; frameMs: number };

export interface UndoStack {
  push(entry: UndoEntry): void;
  /** 取出上一步（同时把当前状态放进重做栈）。没有则返回 null。 */
  undo(current: UndoEntry): UndoEntry | null;
  redo(current: UndoEntry): UndoEntry | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly depth: number;
  clear(): void;
}

/**
 * 快照式撤销栈。19600 帧 ≈ 157KB 一份，所以有上限——几百步「在预算内」是指
 * 内存能扛，但没必要为了一次涂改留 157KB 的历史，默认 120 步（≈19MB）。
 */
export function createUndoStack(limit = 120): UndoStack {
  const past: UndoEntry[] = [];
  const future: UndoEntry[] = [];
  return {
    push(entry) {
      past.push(entry);
      while (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      const prev = past.pop();
      if (!prev) return null;
      future.push(current);
      while (future.length > limit) future.shift();
      return prev;
    },
    redo(current) {
      const next = future.pop();
      if (!next) return null;
      past.push(current);
      return next;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get depth() {
      return past.length;
    },
    clear() {
      past.length = 0;
      future.length = 0;
    }
  };
}
