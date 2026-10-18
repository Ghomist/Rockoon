/**
 * 更新日志（release notes）的解析 —— 一个够用就行的 markdown 子集。
 *
 * 正文来源：GitHub release 的正文 = release 里那份 `latest.json` 的 `notes`
 * = 下载站镜像原样透传 = 启动器 `@tauri-apps/plugin-updater` 的 `update.body`。
 * 原文由 `release-notes/<版本>.md` 提供，格式约定见该目录的 README。
 *
 * 支持的东西（恰好是写日志会用到的那部分）：
 *
 *   ## 新增            ATX 标题，`**新增**` 和裸写「新增」也认
 *   - 条目             `-` / `*` / `+` 列表，缩进 = 嵌套层级
 *   1. 条目            有序列表
 *   > 引用
 *   ``` 围栏代码块
 *   ---                分隔线
 *
 *   行内：`code`、**粗**、*斜*、~~删除线~~、[文字](链接)。
 *
 * 刻意不引 markdown 渲染器：原文是我们自己写的，一个几十行的解析器就够，
 * 而且「解析成 React 节点」这条路没有 `dangerouslySetInnerHTML`，不存在注入面。
 */

/** 行内片段。`strong` / `em` / `del` / `link` 的 children 还是行内片段（允许嵌套）。 */
export type NotesInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: NotesInline[] }
  | { type: "em"; children: NotesInline[] }
  | { type: "del"; children: NotesInline[] }
  | { type: "link"; href: string; children: NotesInline[] };

/** 块级元素。 */
export type NotesBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: NotesListItem[] }
  | { type: "code"; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "paragraph"; text: string };

/** 列表项：`depth` 是嵌套层级（0 = 顶层，缩进 2 格 +1）。 */
export interface NotesListItem {
  depth: number;
  text: string;
}

const HEADING = /^(#{1,6})\s*(.+?)\s*#*\s*$/;
const BOLD_HEADING = /^\*\*(.+?)\*\*\s*[:：]?\s*$/;
const BULLET = /^([-*+])\s+(.+?)\s*$/;
const ORDERED = /^(\d+)[.)]\s+(.+?)\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^(?:```|~~~)/;

/**
 * 不带 `#` 也不加粗的裸标题：只认这几个已知标题词。
 * 用白名单而不是「短行就算标题」，是因为正文里一句短话（比如「支持自制地图」）
 * 被当成标题，比漏认一个标题更糟。
 */
const BARE_TITLES = new Set([
  "新增",
  "新功能",
  "修改",
  "修复",
  "删除",
  "移除",
  "Added",
  "Changed",
  "Fixed",
  "Removed",
  "What's new"
]);

export function isKnownTitle(line: string): boolean {
  // 老日志的写法是「新增：」，冒号可有可无
  return BARE_TITLES.has(line.replace(/[:：]\s*$/, ""));
}

/** 缩进 → 嵌套层级（2 格一层，最多 3 层，免得被莫名其妙的缩进顶飞）。 */
function indentDepth(raw: string): number {
  const spaces = (raw.match(/^[ \t]*/)![0] ?? "").replace(/\t/g, "  ").length;
  return Math.min(3, Math.floor(spaces / 2));
}

/**
 * 行内解析。只认「自己写日志会用到」的那几个标记，认不出来就原样当文字，
 * 所以 `a * b` 这种孤零零的星号不会被吃成斜体。
 */
export function parseInline(text: string): NotesInline[] {
  const out: NotesInline[] = [];
  const re =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]*\]\([^)\s]+\))/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last)
      out.push({ type: "text", text: text.slice(last, m.index) });
    last = m.index + m[0].length;
    const tok = m[0];
    // 包裹符长度不同：`**粗**` 去掉 2 个，`*斜*` 只去 1 个（去错了会把字吃掉）
    const wrapped = (marker: number) => parseInline(tok.slice(marker, -marker));
    if (tok.startsWith("`")) {
      out.push({ type: "code", text: tok.slice(1, -1) });
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push({ type: "strong", children: wrapped(2) });
    } else if (tok.startsWith("~~")) {
      out.push({ type: "del", children: wrapped(2) });
    } else if (tok.startsWith("[")) {
      const link = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tok);
      if (link && /^(https?:\/\/|mailto:)/i.test(link[2])) {
        out.push({
          type: "link",
          href: link[2],
          children: parseInline(link[1])
        });
      } else {
        out.push({ type: "text", text: tok });
      }
    } else {
      out.push({ type: "em", children: wrapped(1) });
    }
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** 把正文拆成块。空行只是分隔，不产生元素。 */
export function parseUpdateNotes(text: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: Extract<NotesBlock, { type: "list" }> | null = null;
  let inComment = false;
  let fence: { lang: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    // 围栏代码块里的内容一律原样保留（不解析行内标记）
    if (fence) {
      if (FENCE.test(raw.trim())) {
        blocks.push({ type: "code", text: fence.lines.join("\n") });
        fence = null;
      } else {
        fence.lines.push(raw);
      }
      continue;
    }

    const line = raw.trim();
    // HTML 注释（`<!-- -->`）：写给维护者看的话，整段（可跨行）都不显示
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }
    if (!line) {
      flush();
      continue;
    }

    if (FENCE.test(line)) {
      flush();
      fence = { lang: line.replace(/^```|^~~~/g, "").trim(), lines: [] };
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }

    const heading = HEADING.exec(line) ?? BOLD_HEADING.exec(line);
    if (heading) {
      flush();
      const level = HEADING.test(line) ? heading[1].length : 2;
      const title = HEADING.test(line) ? heading[2] : heading[1];
      blocks.push({ type: "heading", level, text: title });
      continue;
    }

    // 裸标题：「修改」这种单独一行（只认白名单里的词）
    if (isKnownTitle(line)) {
      flush();
      blocks.push({
        type: "heading",
        level: 2,
        text: line.replace(/[:：]\s*$/, "")
      });
      continue;
    }

    if (line.startsWith(">")) {
      flush();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { type: "list", ordered: isOrdered, items: [] };
      }
      list.items.push({
        depth: indentDepth(raw),
        text: (bullet ? bullet[2] : ordered![2]) ?? ""
      });
      continue;
    }

    // 普通文字：接着上一段（列表里的续行也算段落，简单处理）
    flushList();
    paragraph.push(line);
  }

  if (fence) blocks.push({ type: "code", text: fence.lines.join("\n") });
  flush();
  return blocks;
}
