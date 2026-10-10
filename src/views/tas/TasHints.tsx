/**
 * 编辑区底部的说明条 + 帮助模态（完整快捷键表 + 说明）。
 *
 * 纯展示：键帽是 kbd 样式（等宽 + 边框 + 底色），文案全部走 i18n。
 * 帮助模态复用项目既有的 dialog store（`GlobalDialogHost` 也在 TAS 窗口挂了一份，见 `main.tsx`）。
 */

import { Keyboard } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { dialog } from "@/utils/ui/feedback";
import type { TasMouseMode } from "./TasTimeline";

/**
 * 键帽。字母 / 符号键用等宽字体；「单击」「滚轮」这种中文键名用正文字体 —— 等宽字体里没有
 * 中文字形，小字号下会回退成别的字体、看起来发虚（说明条「有点糊」主要就是这个）。
 */
function Kbd({ children }: { children: ReactNode }) {
  const ascii = typeof children === "string" && /^[\x20-\x7e]+$/.test(children);
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 border-border bg-muted px-1.5 text-[11px] leading-none font-medium text-foreground",
        ascii ? "font-mono" : "font-sans"
      )}
    >
      {children}
    </kbd>
  );
}

/** 一组键（用 `+` 连接）。 */
function Combo({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-0.5">
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-muted-foreground/60">+</span>}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </span>
  );
}

type Hint = { keys: string[]; label: string };

/** 说明条里的一条：几种按法（之间用「/」隔开，每种是一组同时按的键，用「+」连）+ 说明。 */
type BarHint = { combos: string[][]; label: string };

/** 每种鼠标模式的名字和切换键（和编辑面板里的四选一一致）。 */
const MODE_META: Record<TasMouseMode, { labelKey: string; key: string }> = {
  select: { labelKey: "tas.modeSelect", key: "1" },
  draw: { labelKey: "tas.modeDraw", key: "2" },
  fill: { labelKey: "tas.modeFill", key: "3" },
  record: { labelKey: "tas.modeRecord", key: "4" }
};

/** 说明条左半：当前鼠标模式下最常用的几条。 */
function modeHints(mode: TasMouseMode): BarHint[] {
  const kbd = (key: string) => t(`tas.kbd.${key}`);
  const h = (key: string) => t(`tas.hintBar.${key}`);
  const move: BarHint = { combos: [["Alt", kbd("drag")]], label: h("move") };
  const row: BarHint = { combos: [["Shift", kbd("drag")]], label: h("row") };
  const byMode: Record<TasMouseMode, BarHint[]> = {
    select: [
      { combos: [[kbd("click")]], label: h("selectClick") },
      { combos: [[kbd("drag")]], label: h("selectDrag") },
      { combos: [["←"], ["→"]], label: h("selectFrame") },
      { combos: [["↑"], ["↓"]], label: h("selectTrack") },
      { combos: [["Delete"]], label: h("selectDelete") },
      move
    ],
    draw: [
      { combos: [[kbd("left")]], label: h("drawPaint") },
      { combos: [[kbd("right")]], label: h("drawErase") },
      row,
      move
    ],
    fill: [
      { combos: [[kbd("left"), kbd("drag")]], label: h("fillSetDrag") },
      { combos: [[kbd("right"), kbd("drag")]], label: h("fillClearDrag") },
      row,
      move
    ],
    record: [
      { combos: [[kbd("drag")]], label: h("recordRange") },
      {
        combos: [["↑←→↓"], ["Shift"], ["Space"], ["Q"], ["Enter"], ["Esc"]],
        label: h("recordKeys")
      },
      { combos: [["Tab"], ["Shift", "Tab"]], label: h("recordStep") }
    ]
  };
  return byMode[mode];
}

/** 说明条右半：任何模式都通用的视图 / 导航操作。 */
function commonHints(): BarHint[] {
  const kbd = (key: string) => t(`tas.kbd.${key}`);
  const h = (key: string) => t(`tas.hintBar.${key}`);
  return [
    { combos: [[kbd("wheel")], ["W"], ["S"]], label: h("zoom") },
    { combos: [["Shift", kbd("wheel")], ["A"], ["D"]], label: h("pan") },
    {
      combos: [
        ["Space", kbd("drag")],
        [kbd("middle"), kbd("drag")]
      ],
      label: h("view")
    },
    { combos: [["["], ["]"]], label: h("jump") },
    { combos: [["Ctrl", "Z"]], label: h("undo") }
  ];
}

function BarItem({ hint }: { hint: BarHint }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="flex items-center gap-1">
        {hint.combos.map((combo, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
            <Combo keys={combo} />
          </span>
        ))}
      </span>
      <span className="text-xs text-foreground/80">{hint.label}</span>
    </span>
  );
}

/** 帮助模态里的完整快捷键表。 */
function helpRows(): Hint[] {
  const kbd = (key: string) => t(`tas.kbd.${key}`);
  return [
    { keys: ["1", "2", "3", "4"], label: t("tas.helpRows.modes") },
    { keys: [kbd("click")], label: t("tas.helpRows.pickRun") },
    { keys: [kbd("drag")], label: t("tas.helpRows.boxSelect") },
    { keys: [kbd("arrows")], label: t("tas.helpRows.moveRun") },
    { keys: [kbd("left")], label: t("tas.helpRows.paint") },
    { keys: [kbd("right")], label: t("tas.helpRows.erase") },
    {
      keys: [kbd("left"), kbd("right"), kbd("drag")],
      label: t("tas.helpRows.fill")
    },
    { keys: [kbd("drag")], label: t("tas.helpRows.select") },
    { keys: ["Shift", kbd("drag")], label: t("tas.helpRows.row") },
    { keys: ["Alt", kbd("drag")], label: t("tas.helpRows.move") },
    { keys: ["[", "]"], label: t("tas.helpRows.jumpRun") },
    { keys: ["W", "S"], label: t("tas.helpRows.zoom") },
    { keys: ["A", "D"], label: t("tas.helpRows.pan") },
    { keys: [kbd("wheel")], label: t("tas.helpRows.wheel") },
    {
      keys: ["Space", kbd("middle"), kbd("drag")],
      label: t("tas.helpRows.view")
    },
    { keys: ["Tab", "Shift", "Tab"], label: t("tas.helpRows.tab") },
    { keys: ["Home", "End"], label: t("tas.helpRows.home") },
    { keys: ["Delete", "Backspace"], label: t("tas.helpRows.clear") },
    { keys: ["Ctrl", "Z"], label: t("tas.helpRows.undo") },
    { keys: ["Ctrl", "C", "X", "V"], label: t("tas.helpRows.clip") },
    { keys: ["Esc"], label: t("tas.helpRows.esc") },
    { keys: [kbd("trackHeader")], label: t("tas.helpRows.reorder") },
    { keys: [], label: t("tas.helpRows.lock") }
  ];
}

function Row({ hint }: { hint: Hint }) {
  return (
    <div className="flex items-start gap-2">
      <Combo keys={hint.keys} />
      <span className="text-xs leading-4">{hint.label}</span>
    </div>
  );
}

function HelpContent() {
  const notes = [
    t("tas.helpUnified"),
    t("tas.helpModes"),
    t("tas.helpSelect"),
    t("tas.helpRunLength"),
    t("tas.helpRow"),
    t("tas.helpRecord"),
    t("tas.helpCover"),
    t("tas.helpLock"),
    t("tas.helpPlayback"),
    t("tas.helpBackup")
  ];
  return (
    <div className="max-h-[65vh] min-w-0 space-y-4 overflow-auto pr-1 text-left">
      <div className="space-y-2">
        {helpRows().map((hint, i) => (
          <Row key={i} hint={hint} />
        ))}
      </div>
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium text-foreground">
          {t("tas.helpNoteTitle")}
        </p>
        {notes.map((note, i) => (
          <p key={i} className="text-xs leading-5">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}

/** 打开帮助模态。 */
export function openTasHelp(): void {
  dialog.create({
    title: t("tas.helpTitle"),
    className: "max-w-2xl",
    content: () => <HelpContent />
  });
}

/**
 * 编辑区底部固定的说明区：当前模式（名字 + 切换键）│ 这个模式最常用的几条 │ 通用的视图操作，
 * 右端是完整快捷键表。窄的时候自动折行。
 */
export default function TasHintBar({ mode }: { mode: TasMouseMode }) {
  const meta = MODE_META[mode];
  return (
    <div className="flex shrink-0 items-start gap-3 border-t bg-muted/30 px-3 py-2">
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        title={t("tas.hintBar.mode")}
      >
        {t(meta.labelKey)}
        <Kbd>{meta.key}</Kbd>
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
        {modeHints(mode).map((hint, i) => (
          <BarItem key={`m${i}`} hint={hint} />
        ))}
        <span className="h-4 w-px shrink-0 bg-border" />
        {commonHints().map((hint, i) => (
          <BarItem key={`c${i}`} hint={hint} />
        ))}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="shrink-0"
        title={t("tas.help")}
        onClick={openTasHelp}
      >
        <Keyboard />
        {t("tas.hintBar.allKeys")}
      </Button>
    </div>
  );
}
