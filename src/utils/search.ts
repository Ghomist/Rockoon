/**
 * 列表页的模糊搜索：不区分大小写、空格分词、每个词都要命中（顺序无所谓）。
 *
 * 匹配前会去掉扩展名与 `.disable` 后缀 —— 否则搜「bmod」会命中一堆文件，
 * 搜地图名时还得记得别把 `.nmo` 打进搜索框。
 */
export function normalizeForSearch(name: string): string {
  return name
    .replace(/\.disable$/i, "")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .toLowerCase();
}

/** query 为空/只有空格时视为「不过滤」 */
export function matchesQuery(name: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalizeForSearch(name);
  return terms.every(term => haystack.includes(term));
}
