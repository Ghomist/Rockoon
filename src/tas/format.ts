/**
 * Ballance `.tas` 文件格式（与 BallanceTASEditor、TASSupport 模组一致）
 *
 * 文件结构：
 *   [0, 4)   int32 LE    未压缩数据长度（= 帧数 × 8）
 *   [4, ..)  zlib 流      帧数据，每帧 8 字节：
 *                          float32 LE  deltaTime（毫秒）
 *                          uint32  LE  keystates
 *
 * keystates 位序（固定，**不要改**，改了游戏就读不懂了）：
 *   bit0 ↑   bit1 ↓   bit2 ←   bit3 →   bit4 Shift   bit5 Space   bit6 Q   bit7 Esc   bit8 Enter
 *
 * 注意：这个位序与界面上的「轨道顺序」无关。轨道顺序只是显示概念（默认按用户指定的
 * ↑ ← → ↓ Shift Space Q Enter Esc 排列，且允许用户拖拽调整），读写始终按位序。
 *
 * 实测样本 `D:\Ballance\ModLoader\TAS\SR_01_1.16.726.tas`：
 *   19600 帧，每帧 deltaTime 都是 4.166667 毫秒，即 1000/240 —— 游戏是 240Hz 固定步长。
 */

export const FRAME_SIZE = 8;

/** 标准步长：240Hz（毫秒）。实测 .tas 里每帧都是这个值。 */
export const DEFAULT_DELTA_MS = 1000 / 240;

/** 每秒的帧数（时间轴刻度用）。 */
export const FRAMES_PER_SECOND = 240;

/** keystates 的位序：下标 = 位号。 */
export const KEY_BITS = [
  "up",
  "down",
  "left",
  "right",
  "shift",
  "space",
  "q",
  "esc",
  "enter"
] as const;

export type TasKey = (typeof KEY_BITS)[number];

/** 界面默认的轨道从上到下顺序（用户指定），与位序不同。 */
export const DEFAULT_TRACK_ORDER: TasKey[] = [
  "up",
  "left",
  "right",
  "down",
  "shift",
  "space",
  "q",
  "enter",
  "esc"
];

/** 轨道的展示信息。icon 走项目里的 Icon 组件（键名需存在于图标表）。 */
export const KEY_META: Record<TasKey, { label: string; short: string }> = {
  up: { label: "前进 (↑)", short: "↑" },
  down: { label: "后退 (↓)", short: "↓" },
  left: { label: "左转 (←)", short: "←" },
  right: { label: "右转 (→)", short: "→" },
  shift: { label: "慢速 (Shift)", short: "Shift" },
  space: { label: "跳跃 (Space)", short: "Space" },
  q: { label: "Q", short: "Q" },
  esc: { label: "菜单 (Esc)", short: "Esc" },
  enter: { label: "Enter", short: "Enter" }
};

/** 位号 → 掩码。 */
export const keyMask = (key: TasKey): number => 1 << KEY_BITS.indexOf(key);

/**
 * 录入模式的按键映射：`KeyboardEvent.key` → 轨道（其它键返回 null）。
 * 九个键就是全部按键，一个不多一个不少 —— 所以这个映射本身就是「录入模式接管哪些键」的定义。
 */
export function recordKeyFor(key: string): TasKey | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Shift":
      return "shift";
    case " ":
      return "space";
    case "q":
    case "Q":
      return "q";
    case "Enter":
      return "enter";
    case "Escape":
      return "esc";
    default:
      return null;
  }
}

// ---------------------------------------------------------------- zlib（浏览器原生，零依赖）

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------- 帧数据

/**
 * 一整个 .tas 的帧数据。内部就是紧凑的 `Uint8Array`（每帧 8 字节），
 * 编辑都就地做在上面——19600 帧也只有 157KB，不需要更复杂的数据结构。
 */
export class TasFile {
  /** 帧数据本体（frameCount × 8 字节）。 */
  data: Uint8Array;

  constructor(data: Uint8Array) {
    if (data.length % FRAME_SIZE !== 0) {
      throw new Error(`帧数据长度 ${data.length} 不是 ${FRAME_SIZE} 的整数倍`);
    }
    this.data = data;
  }

  get frameCount(): number {
    return this.data.length / FRAME_SIZE;
  }

  /** 第 frame 帧的 deltaTime（毫秒）。 */
  getDeltaTime(frame: number): number {
    return this.view().getFloat32(frame * FRAME_SIZE, true);
  }

  setDeltaTime(frame: number, ms: number): void {
    this.view().setFloat32(frame * FRAME_SIZE, ms, true);
  }

  /** 第 frame 帧按下 key 了吗。 */
  getKey(frame: number, key: TasKey): boolean {
    const mask = keyMask(key);
    return (this.view().getUint32(frame * FRAME_SIZE + 4, true) & mask) !== 0;
  }

  setKey(frame: number, key: TasKey, down: boolean): void {
    const view = this.view();
    const at = frame * FRAME_SIZE + 4;
    const current = view.getUint32(at, true);
    const mask = keyMask(key);
    const next = down ? current | mask : current & ~mask;
    if (next !== current) view.setUint32(at, next >>> 0, true);
  }

  /** 这一帧按了哪些键（按位序）。 */
  keysAt(frame: number): TasKey[] {
    const states = this.view().getUint32(frame * FRAME_SIZE + 4, true);
    return KEY_BITS.filter((_, bit) => (states & (1 << bit)) !== 0);
  }

  /** 该文件里出现最多的 deltaTime——插入新帧时用它（通常是 1000/240）。 */
  get commonDeltaTime(): number {
    const counts = new Map<number, number>();
    for (let i = 0; i < this.frameCount; i++) {
      const ms = this.getDeltaTime(i);
      counts.set(ms, (counts.get(ms) ?? 0) + 1);
    }
    let best = DEFAULT_DELTA_MS;
    let bestCount = -1;
    counts.forEach((count, ms) => {
      if (count > bestCount) {
        bestCount = count;
        best = ms;
      }
    });
    return best;
  }

  /** 从第 0 帧到（不含）frame 的累计秒数——时间轴刻度、状态栏用。 */
  secondsAt(frame: number): number {
    let ms = 0;
    const limit = Math.min(frame, this.frameCount);
    for (let i = 0; i < limit; i++) ms += this.getDeltaTime(i);
    return ms / 1000;
  }

  /** 整个文件的时长（秒）。 */
  get durationSeconds(): number {
    return this.secondsAt(this.frameCount);
  }

  /** 导出若干帧的原始字节（复制用）。 */
  sliceFrames(from: number, to: number): Uint8Array {
    return this.data.slice(from * FRAME_SIZE, to * FRAME_SIZE);
  }

  /** 插入空帧（deltaTime 用 commonDeltaTime，按键全松开）。 */
  insertFrames(at: number, count: number, deltaMs = this.commonDeltaTime): void {
    const blank = new Uint8Array(count * FRAME_SIZE);
    const view = new DataView(blank.buffer);
    for (let i = 0; i < count; i++) view.setFloat32(i * FRAME_SIZE, deltaMs, true);
    this.splice(at, 0, blank);
  }

  /** 删除若干帧。 */
  removeFrames(at: number, count: number): void {
    this.splice(at, count, new Uint8Array(0));
  }

  /** 把一段帧写入指定位置：overwrite = 覆盖同样多帧（不够则补空帧），insert = 插入。 */
  pasteFrames(at: number, frames: Uint8Array, mode: "overwrite" | "insert"): void {
    if (mode === "insert") {
      this.splice(at, 0, frames);
      return;
    }
    const needed = Math.ceil((at * FRAME_SIZE + frames.length) / FRAME_SIZE);
    if (needed > this.frameCount) {
      const grown = new Uint8Array(needed * FRAME_SIZE);
      grown.set(this.data, 0);
      const view = new DataView(grown.buffer);
      const delta = this.commonDeltaTime;
      for (let i = this.frameCount; i < needed; i++) view.setFloat32(i * FRAME_SIZE, delta, true);
      this.data = grown;
    }
    this.data.set(frames, at * FRAME_SIZE);
  }

  private splice(at: number, removeCount: number, insert: Uint8Array): void {
    const cutFrom = at * FRAME_SIZE;
    const cutTo = cutFrom + removeCount * FRAME_SIZE;
    const next = new Uint8Array(this.data.length - (cutTo - cutFrom) + insert.length);
    next.set(this.data.subarray(0, cutFrom), 0);
    next.set(insert, cutFrom);
    next.set(this.data.subarray(cutTo), cutFrom + insert.length);
    this.data = next;
  }

  private view(): DataView {
    // Uint8Array 一定带 buffer；byteOffset 通常是 0，但 slice 出来的可能是视图，用真实偏移。
    return new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }
}

// ---------------------------------------------------------------- 文件读写

/** 解析 .tas 字节。 */
export async function parseTas(fileBytes: Uint8Array): Promise<TasFile> {
  if (fileBytes.length < 4) throw new Error("文件太短，不是 .tas");
  const header = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
  const declared = header.getInt32(0, true);
  if (declared < 0 || declared % FRAME_SIZE !== 0) {
    throw new Error(`文件头的长度字段 ${declared} 不像帧数据长度`);
  }
  let raw: Uint8Array;
  try {
    raw = await inflateZlib(fileBytes.subarray(4));
  } catch (error) {
    throw new Error(`zlib 解压失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw.length !== declared) {
    throw new Error(`文件头声明 ${declared} 字节，解压出 ${raw.length} 字节`);
  }
  return new TasFile(raw);
}

/** 序列化成 .tas 字节（4 字节长度 + zlib）。 */
export async function writeTas(tas: TasFile): Promise<Uint8Array> {
  const body = await deflateZlib(tas.data);
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setInt32(0, tas.data.length, true);
  out.set(body, 4);
  return out;
}
