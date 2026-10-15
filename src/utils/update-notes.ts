/**
 * 更新日志（release notes）的解析。
 *
 * 正文来源：GitHub release 的正文 = release 里那份 `latest.json` 的 `notes`
 * = 下载站镜像原样透传 = 启动器 `@tauri-apps/plugin-updater` 的 `update.body`。
 * 原文由 `release-notes/<版本>.md` 提供，格式约定见该目录的 README：
 *
 *   ## 新增
 *   - 一键播放支持自制地图
 *   ## 修改
 *   - 时间轴现在可以拖拽
 *
 * 标题写成 `## 新增`、`**新增**`、或者干脆一行「新增」都认；`-` / `*` 开头是条目，
 * 其它非空行当成正文段落。这份文件是手写的，所以容错比严格重要 —— 认不出来就原样显示。
 */

export interface UpdateNotesSection {
  /** 原文里的标题（如「新增」），没有标题时是空串 */
  title: string;
  items: string[];
}

const HEADING = /^#{1,6}\s*(.+?)\s*$/;
const BOLD_HEADING = /^\*\*(.+?)\*\*\s*[:：]?\s*$/;
const BULLET = /^[-*+]\s+(.+?)\s*$/;

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
  return BARE_TITLES.has(line);
}

export function parseUpdateNotes(text: string): UpdateNotesSection[] {
  const sections: UpdateNotesSection[] = [];
  let title = "";
  let items: string[] = [];
  const flush = () => {
    if (title || items.length) sections.push({ title, items });
    title = "";
    items = [];
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    // 空行与 HTML 注释（`<!-- -->`）忽略：注释用来在正文里写给维护者看的话
    if (!line || line.startsWith("<!--")) continue;

    const heading = HEADING.exec(line) ?? BOLD_HEADING.exec(line);
    if (heading) {
      flush();
      title = heading[1];
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      items.push(bullet[1]);
      continue;
    }

    // 裸标题：「修改」这种单独一行（只认白名单里的词）
    if (isKnownTitle(line)) {
      flush();
      title = line;
      continue;
    }

    items.push(line);
  }
  flush();
  return sections;
}
