/**
 * 一键播放要动的 BallanceTAS 2.0 启动配置（`ModLoader/Configs/BallanceTAS.cfg`）。
 *
 * 2.0.0-beta.1 起：录像（`.tas`）在启动时只是「armed」，要等关卡载入才开始播；
 * `Startup.Level` 让游戏启动后自己进那一关（`Level_01` … `Level_13`）。录像文件里
 * 没有关卡信息，所以关卡要由编辑器给出（文件名能猜就猜，见 `inferLevel`）。
 * 游戏里这两项是单选列表（`BML_SetConfigPropertyChoices`），但写进 cfg 仍是普通的 `S`。
 *
 * 「从当前帧播放」= `TAS.SkipRenderUntilFrame`（`I`）：回放照常从第 0 帧跑物理，只是第 N 帧
 * 之前不渲染；RockoonIO 的限速在不渲染时自动放开，于是一路快进到第 N 帧再按设定速度播。
 * 「从头播放」就是写 0。
 *
 * 只负责算「哪几项要改」，读写交给 `backend.readModConfig` / `saveModConfig`
 * —— 走它才能保住分区、条目描述与注释（`.cfg` 里字符串写作 `S <名字> <值>`、
 * 布尔写作 `B <名字> 0|1`，值不带引号）。
 */

/** 一键播放必须打开的开关（值都是 `1`）。 */
const SWITCHES = [
  { category: "TAS", name: "Enable", labelKey: "tas.playItemTasEnable" },
  {
    category: "Startup",
    name: "Enabled",
    labelKey: "tas.playItemStartupEnabled"
  },
  { category: "Startup", name: "AutoLoad", labelKey: "tas.playItemAutoLoad" }
];

/** 要播放的项目：`.tas` 文件名去掉扩展名。 */
const PROJECT = {
  category: "Startup",
  name: "Project",
  labelKey: "tas.playItemProject"
};

/** 启动后自动进入的关卡。 */
const LEVEL = {
  category: "Startup",
  name: "Level",
  labelKey: "tas.playItemLevel"
};

/** 「从第 N 帧开始看」：N 帧之前不渲染、不限速（`0` = 每帧都渲染 = 从头播放）。 */
const SKIP = {
  category: "TAS",
  name: "SkipRenderUntilFrame",
  labelKey: "tas.playItemSkip"
};

/** 一键播放要写进配置的目标。 */
export type PlaybackTarget = {
  /** 项目名（`.tas` 文件名去掉扩展名） */
  project: string;
  /** 关卡 1~13 */
  level: number;
  /** 从第几帧开始看（之前的帧快进）；0 = 从头 */
  skipFrames: number;
};

/** Ballance 的关卡编号范围。 */
export const TAS_LEVELS = Array.from({ length: 13 }, (_, i) => i + 1);

/** 关卡号 → `Startup.Level` 的取值（`Level_01` … `Level_13`）。 */
export const levelValue = (level: number) =>
  `Level_${String(level).padStart(2, "0")}`;

const validLevel = (n: number) => (n >= 1 && n <= 13 ? n : null);

/**
 * 从项目名猜关卡：`SR_01_1.16.726` / `Level_03` / `L5-xxx` / `lv12` → 1 / 3 / 5 / 12。
 * 先认带前缀的写法，再退回「开头或下划线隔开的一两位数」。猜不出返回 null。
 */
export function inferLevel(project: string): number | null {
  const prefixed = /(?:level|lvl|lv|sr|l)[_\- ]?0*(\d{1,2})(?!\d)/i.exec(
    project
  );
  if (prefixed) return validLevel(Number(prefixed[1]));
  const bare = /(?:^|[_\- ])0*(\d{1,2})(?=[_\- ]|$)/.exec(project);
  return bare ? validLevel(Number(bare[1])) : null;
}

export type TasCfgChange = {
  category: string;
  name: string;
  /** 该项的人话名称（i18n key，由视图层翻译）。 */
  labelKey: string;
  /** 当前值；`undefined` = 文件里没有这一项。 */
  from: string | undefined;
  to: string;
  /** `true` = 开关（显示成开/关），`false` = 字符串值（原样显示）。 */
  toggle: boolean;
};

type Target = {
  category: string;
  name: string;
  labelKey: string;
  value: string;
  toggle: boolean;
  /** 文件里缺这一项时补成什么类型 */
  datatype: "B" | "S" | "I";
};

/** 期望写入的 5 项（顺序固定，配置里也按这个顺序补缺项）。 */
const targets = ({ project, level, skipFrames }: PlaybackTarget): Target[] => [
  ...SWITCHES.map(s => ({
    ...s,
    value: "1",
    toggle: true,
    datatype: "B" as const
  })),
  { ...PROJECT, value: project, toggle: false, datatype: "S" },
  { ...LEVEL, value: levelValue(level), toggle: false, datatype: "S" },
  {
    ...SKIP,
    value: String(Math.max(0, Math.floor(skipFrames))),
    toggle: false,
    datatype: "I"
  }
];

const findEntry = (cfg: ModConfig, category: string, name: string) =>
  (cfg.entries[category] ?? []).find(e => e.name === name);

/**
 * 读到的配置是不是 BallanceTAS 的。
 * （卡片读不到文件会直接抛错；这里挡的是「文件读到了但不是这个 mod 的」，
 * 免得把别的 mod 的 cfg 写成一堆无关条目。）
 */
export function looksLikeBallanceTas(cfg: ModConfig): boolean {
  return Boolean(cfg.entries.TAS || cfg.entries.Startup || cfg.entries.OSD);
}

/** 需要改哪几项（当前值 ≠ 期望值，含文件里缺的项）。空数组 = 什么都不用改。 */
export function planPlayback(
  cfg: ModConfig,
  target: PlaybackTarget
): TasCfgChange[] {
  const changes: TasCfgChange[] = [];
  for (const w of targets(target)) {
    const entry = findEntry(cfg, w.category, w.name);
    if (!entry || entry.value !== w.value) {
      changes.push({
        category: w.category,
        name: w.name,
        labelKey: w.labelKey,
        from: entry?.value,
        to: w.value,
        toggle: w.toggle
      });
    }
  }
  return changes;
}

/**
 * 把这几项写成期望值（缺项就补上：开关补 `B`、项目名 / 关卡补 `S`、跳过帧数补 `I`）。
 * **原地改** `cfg` 并返回它；其它分区、条目、描述、注释一律不动。
 */
export function applyPlayback(
  cfg: ModConfig,
  target: PlaybackTarget
): ModConfig {
  for (const w of targets(target)) {
    // 分区没有描述条目时后端会整段跳过它，补缺项必须把分区也登记上
    if (cfg.categories[w.category] === undefined)
      cfg.categories[w.category] = "";
    if (!cfg.entries[w.category]) cfg.entries[w.category] = [];
    const list = cfg.entries[w.category];
    const entry = list.find(e => e.name === w.name);
    if (entry) entry.value = w.value;
    else
      list.push({
        name: w.name,
        description: "",
        datatype: w.datatype,
        value: w.value
      });
  }
  return cfg;
}

// ---------------------------------------------------------------- 播完改回去

/** 一键播放改过的一项：改之前是什么（`undefined` = 原来没有这一项，改回去时删掉）。 */
export type CfgRestoreEntry = {
  category: string;
  name: string;
  from: string | undefined;
};

/** 待恢复的配置（存在 localStorage：编辑器崩了 / 关了也不会丢）。 */
export type CfgRestore = { cfgPath: string; entries: CfgRestoreEntry[] };

const RESTORE_KEY = "rockoon-tas-cfg-restore";

export function loadPendingRestore(): CfgRestore | null {
  try {
    const raw = window.localStorage.getItem(RESTORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CfgRestore;
    return v && typeof v.cfgPath === "string" && Array.isArray(v.entries)
      ? v
      : null;
  } catch {
    return null;
  }
}

function savePendingRestore(v: CfgRestore | null) {
  try {
    if (v) window.localStorage.setItem(RESTORE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(RESTORE_KEY);
  } catch {
    // 存不了就算了：最坏情况是不自动改回去，正常启动时还有保底询问
  }
}

/**
 * 记下这次一键播放改了哪些项。连着播好几次时**保留最早的原值**（第二次播放时文件里已经是
 * 我们写的值了，那不是用户原来的设置）。
 */
export function rememberRestore(cfgPath: string, changes: TasCfgChange[]) {
  if (changes.length === 0) return;
  const cur = loadPendingRestore();
  const entries =
    cur && cur.cfgPath === cfgPath
      ? [...cur.entries]
      : ([] as CfgRestoreEntry[]);
  for (const c of changes) {
    if (!entries.some(e => e.category === c.category && e.name === c.name))
      entries.push({ category: c.category, name: c.name, from: c.from });
  }
  savePendingRestore({ cfgPath, entries });
}

/** 把记下的项改回原值（原来没有的项删掉）。**原地改** `cfg` 并返回它。 */
export function applyRestore(
  cfg: ModConfig,
  entries: CfgRestoreEntry[]
): ModConfig {
  for (const r of entries) {
    const list = cfg.entries[r.category];
    if (!list) continue;
    const i = list.findIndex(e => e.name === r.name);
    if (i < 0) continue;
    if (r.from === undefined) list.splice(i, 1);
    else list[i].value = r.from;
  }
  return cfg;
}

export function clearPendingRestore() {
  savePendingRestore(null);
}

/** BallanceTAS 现在是不是「游戏一启动就自动进关卡回放」（正常启动游戏前的保底检查用）。 */
export function autoplayEnabled(cfg: ModConfig): boolean {
  const on = (category: string, name: string) =>
    findEntry(cfg, category, name)?.value === "1";
  return (
    on("TAS", "Enable") && on("Startup", "Enabled") && on("Startup", "AutoLoad")
  );
}

/** 关掉启动时自动播放（只动 `Startup.AutoLoad`，其它设置不碰）。**原地改** `cfg`。 */
export function disableAutoplay(cfg: ModConfig): ModConfig {
  const entry = findEntry(cfg, "Startup", "AutoLoad");
  if (entry) entry.value = "0";
  return cfg;
}

/** 当前的启动项目 / 关卡（询问框里给玩家看）。 */
export function autoplayTarget(cfg: ModConfig): {
  project: string;
  level: string;
} {
  return {
    project: findEntry(cfg, "Startup", "Project")?.value ?? "",
    level: findEntry(cfg, "Startup", "Level")?.value ?? ""
  };
}
