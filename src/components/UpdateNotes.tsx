import { useMemo } from "react";

import { t } from "@/i18n";
import { parseUpdateNotes } from "@/utils/update-notes";

/** 标题 → i18n 键；认不出来就用原文（作者可能自己起了别的标题） */
const TITLE_KEYS: Record<string, string> = {
  新增: "updater.added",
  Added: "updater.added",
  "What's new": "updater.added",
  修改: "updater.changed",
  修复: "updater.changed",
  Changed: "updater.changed",
  Fixed: "updater.changed",
  删除: "updater.removed",
  移除: "updater.removed",
  Removed: "updater.removed"
};

function sectionTitle(raw: string): string {
  const key = TITLE_KEYS[raw];
  return key ? t(key) : raw;
}

/**
 * 更新弹窗里的更新日志。
 *
 * 正文是 markdown 风格的短文（新增/修改/删除 三段），这里只做三段最基础的排版：
 * 标题加粗、条目成列表、太长时可以滚。故意不引 markdown 渲染器 —— 原文是我们自己写的。
 */
export function UpdateNotes({
  version,
  notes
}: {
  version: string;
  notes: string;
}) {
  const sections = useMemo(() => parseUpdateNotes(notes), [notes]);

  return (
    <div className="space-y-3 text-sm">
      <p>{t("updater.available", { version })}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {t("updater.notes")}
        </p>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {sections.map((section, i) => (
            <div key={i} className="space-y-1">
              {section.title && (
                <p className="font-medium">{sectionTitle(section.title)}</p>
              )}
              {section.items.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground marker:text-muted-foreground/60">
                  {section.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 给 `dialog.info({ content })` 用的「返回节点的函数」形式。
 * 导出成函数是为了能在别处（比如开发时的 DOM 探针）直接渲染同一份内容。
 */
export function updateNotesContent(version: string, notes: string) {
  return () => <UpdateNotes version={version} notes={notes} />;
}
