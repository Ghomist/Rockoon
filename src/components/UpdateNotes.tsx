import { Fragment, useMemo } from "react";

import { t } from "@/i18n";
import {
  parseInline,
  parseUpdateNotes,
  type NotesBlock,
  type NotesInline
} from "@/utils/update-notes";

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

/** 外链走系统的默认浏览器（和侧边栏的社区链接同一套）。 */
function openExternal(url: string) {
  void import("@tauri-apps/plugin-shell").then(m => m.open(url));
}

function Inline({ nodes }: { nodes: NotesInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
              >
                {node.text}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-medium text-foreground">
                <Inline nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inline nodes={node.children} />
              </em>
            );
          case "del":
            return (
              <del key={i} className="opacity-70">
                <Inline nodes={node.children} />
              </del>
            );
          case "link":
            return (
              <a
                key={i}
                href={node.href}
                className="underline underline-offset-2 hover:text-foreground"
                onClick={e => {
                  e.preventDefault();
                  openExternal(node.href);
                }}
              >
                <Inline nodes={node.children} />
              </a>
            );
          default:
            return <Fragment key={i}>{node.text}</Fragment>;
        }
      })}
    </>
  );
}

function Block({ block }: { block: NotesBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <p className="font-medium text-foreground">
          <Inline nodes={parseInline(sectionTitle(block.text))} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} style={{ marginLeft: item.depth * 14 }}>
          <Inline nodes={parseInline(item.text)} />
        </li>
      ));
      const cls =
        "space-y-0.5 pl-5 text-muted-foreground marker:text-muted-foreground/60";
      return block.ordered ? (
        <ol className={`list-decimal ${cls}`}>{items}</ol>
      ) : (
        <ul className={`list-disc ${cls}`}>{items}</ul>
      );
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
          {block.text}
        </pre>
      );
    case "quote":
      return (
        <p className="border-l-2 pl-2 text-muted-foreground">
          <Inline nodes={parseInline(block.text)} />
        </p>
      );
    case "hr":
      return <hr className="border-border/60" />;
    default:
      return (
        <p className="text-muted-foreground">
          <Inline nodes={parseInline(block.text)} />
        </p>
      );
  }
}

/**
 * 更新弹窗里的更新日志。
 *
 * 正文是 markdown（格式见 `release-notes/README.md`），解析在
 * `src/utils/update-notes.ts`，这里只负责把块 / 行内片段映射成样式。
 * 解析成 React 节点而不是 HTML 字符串，所以不需要（也不能）用 dangerouslySetInnerHTML。
 */
export function UpdateNotes({
  version,
  notes
}: {
  version: string;
  notes: string;
}) {
  const blocks = useMemo(() => parseUpdateNotes(notes), [notes]);

  return (
    <div className="space-y-3 text-sm">
      <p>{t("updater.available", { version })}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {t("updater.notes")}
        </p>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {blocks.map((block, i) => (
            <Block key={i} block={block} />
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
