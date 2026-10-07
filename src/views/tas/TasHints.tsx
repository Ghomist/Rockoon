/**
 * 编辑区底部的说明条 + 帮助模态（完整快捷键表 + 说明）。
 *
 * 纯展示：键帽是 kbd 样式（等宽 + 边框 + 底色），文案全部走 i18n。
 * 帮助模态复用项目既有的 dialog store（`GlobalDialogHost` 也在 TAS 窗口挂了一份，见 `main.tsx`）。
 */

import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { dialog } from "@/utils/ui/feedback";

/** 键帽。 */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-foreground/80">
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

/** 底部说明条：只放最常用的几条，完整表在帮助里。 */
function barHints(): Hint[] {
  const kbd = (key: string) => t(`tas.kbd.${key}`);
  return [
    { keys: ["W", "S"], label: t("tas.hints.zoom") },
    { keys: ["Tab"], label: t("tas.hints.next") },
    { keys: ["Shift", "Tab"], label: t("tas.hints.prev") },
    { keys: ["Shift", kbd("drag")], label: t("tas.hints.select") },
    { keys: ["Alt", kbd("drag")], label: t("tas.hints.move") },
    { keys: [kbd("right")], label: t("tas.hints.erase") },
    { keys: ["F2"], label: t("tas.hints.record") }
  ];
}

/** 帮助模态里的完整快捷键表。 */
function helpRows(): Hint[] {
  const kbd = (key: string) => t(`tas.kbd.${key}`);
  return [
    { keys: [kbd("left")], label: t("tas.helpRows.paint") },
    { keys: [kbd("right")], label: t("tas.helpRows.erase") },
    {
      keys: ["Shift", kbd("drag")],
      label: t("tas.helpRows.select")
    },
    { keys: ["Alt", kbd("drag")], label: t("tas.helpRows.move") },
    { keys: ["W", "S"], label: t("tas.helpRows.zoom") },
    { keys: ["A", "D"], label: t("tas.helpRows.pan") },
    { keys: [kbd("wheel")], label: t("tas.helpRows.wheel") },
    { keys: ["Space", kbd("middle"), kbd("drag")], label: t("tas.helpRows.view") },
    { keys: ["Tab", "Shift", "Tab"], label: t("tas.helpRows.tab") },
    { keys: ["Home", "End"], label: t("tas.helpRows.home") },
    { keys: ["Delete", "Backspace"], label: t("tas.helpRows.clear") },
    { keys: ["Ctrl", "Z"], label: t("tas.helpRows.undo") },
    { keys: ["Ctrl", "C", "X", "V"], label: t("tas.helpRows.clip") },
    { keys: ["Esc"], label: t("tas.helpRows.esc") },
    { keys: ["F2"], label: t("tas.helpRows.record") },
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
    t("tas.helpRecord"),
    t("tas.helpCover"),
    t("tas.helpLock"),
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
        <p className="text-xs font-medium text-foreground">{t("tas.helpNoteTitle")}</p>
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

/** 编辑区底部固定的说明区（+ 右上角帮助按钮）。 */
export default function TasHintBar() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5">
      {barHints().map((hint, i) => (
        <span key={i} className="flex items-center gap-1">
          <Combo keys={hint.keys} />
          <span className="text-[11px] text-muted-foreground">{hint.label}</span>
        </span>
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        aria-label={t("tas.help")}
        title={t("tas.help")}
        onClick={openTasHelp}
      >
        <HelpCircle className="size-3.5" />
      </Button>
    </div>
  );
}
