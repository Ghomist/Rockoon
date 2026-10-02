import { RESOURCE_HUB } from "@/services/game";

/**
 * 深链「一键安装」的安装队列。
 *
 * 下载站的资源可以带「依赖」（站内其它资源的 id，常见是地图依赖某个模组）。
 * 之前只装了深链里那一个资源，依赖要用户自己再去装一遍 —— 这里把主资源与依赖
 * 展开成一条队列：依赖在前、主资源在后，安装时按顺序走同一条 BRP 导入流水线。
 */

export type ImportTask = {
  url: string;
  /** 资源名，用于进度提示 */
  name: string;
  /** true = 这是被依赖的资源，不是用户点的那一个 */
  isDependency: boolean;
};

/** 依赖链最多跟这么深，防止脏数据成环 */
const MAX_DEPTH = 5;

type PackageInfo = { name: string; dependencies: string[] };

/** 从下载站地址里取资源 id：/packages/137/download */
function packageIdFromUrl(url: string): number | null {
  const match = /\/packages\/(\d+)(?:\/|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

async function fetchPackageInfo(id: number): Promise<PackageInfo | null> {
  try {
    const res = await fetch(`${RESOURCE_HUB}/packages/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name?: unknown;
      dependencies?: unknown;
    };
    const dependencies = Array.isArray(data.dependencies)
      ? data.dependencies.map(String).filter(d => /^\d+$/.test(d))
      : [];
    return { name: String(data.name ?? ""), dependencies };
  } catch {
    // 站点打不开或资源已下架：当作没有依赖，不要挡住安装
    return null;
  }
}

/**
 * 展开成安装队列（深度优先，依赖先装）。
 * 拿不到资源信息时退化成「只装深链里那一个」，行为与以前一致。
 */
export async function buildImportQueue(mainUrl: string): Promise<ImportTask[]> {
  const mainId = packageIdFromUrl(mainUrl);
  if (mainId === null) return [{ url: mainUrl, name: "", isDependency: false }];

  const tasks: ImportTask[] = [];
  const seen = new Set<number>();

  const visit = async (id: number, depth: number, isDependency: boolean): Promise<void> => {
    if (seen.has(id) || depth > MAX_DEPTH) return;
    seen.add(id);
    const info = await fetchPackageInfo(id);
    if (!info) return;
    for (const dep of info.dependencies) {
      await visit(Number(dep), depth + 1, true);
    }
    tasks.push({
      url: `${RESOURCE_HUB}/packages/${id}/download`,
      name: info.name,
      isDependency
    });
  };

  await visit(mainId, 0, false);
  return tasks.length ? tasks : [{ url: mainUrl, name: "", isDependency: false }];
}
