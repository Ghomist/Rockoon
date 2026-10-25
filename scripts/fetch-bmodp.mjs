// 非 Windows 平台构建用：拿一份已经编好的 RockoonIO.bmodp 放进 Tauri 资源目录。
//
// RockoonIO 是 32 位 MSVC 编译的 BMLPlus 模组（src-bmodp/，build.ps1），macOS / Linux 上编不了；
// 但它本来就是跑在游戏（Wine 里）的 Windows DLL，和平台无关 —— 所以直接从同版本的
// Windows 安装包（GitHub release 的 NSIS 安装包）里解出来。没有同版本就用最新版。
//
// 需要 7-Zip 解 NSIS 包：macOS 上 `brew install sevenzip`（命令是 7zz）。
// 资源已存在就什么都不做；想强制更新就先删掉它，或传 --force。

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Ghomist/Rockoon";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "src-tauri/resources/builtin-mods/RockoonIO.bmodp");
const ENTRY = "resources/builtin-mods/RockoonIO.bmodp";

if (existsSync(TARGET) && !process.argv.includes("--force")) {
  console.log(`[fetch-bmodp] ${TARGET} 已存在，跳过`);
  process.exit(0);
}

const sevenZip = ["7zz", "7z"].find(bin => spawnSync(bin, ["i"], { stdio: "ignore" }).status === 0);
if (!sevenZip) {
  console.error("[fetch-bmodp] 需要 7-Zip 来解 Windows 安装包：brew install sevenzip");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));

async function release(tag) {
  const url = tag
    ? `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
  // CI 里带上 token：runner 共用出口 IP，匿名调用很容易撞上每小时 60 次的限额
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  return res.ok ? res.json() : null;
}

const rel = (await release(`rockoon-v${version}`)) ?? (await release(null));
const asset = rel?.assets?.find(a => /_x64-setup\.exe$/.test(a.name));
if (!asset) {
  console.error(`[fetch-bmodp] ${REPO} 的 release 里没找到 Windows 安装包`);
  process.exit(1);
}
if (rel.tag_name !== `rockoon-v${version}`) {
  console.warn(`[fetch-bmodp] 没有 v${version} 的 release，改用 ${rel.tag_name} 的 RockoonIO`);
}

const work = mkdtempSync(join(tmpdir(), "rockoon-bmodp-"));
try {
  console.log(`[fetch-bmodp] 下载 ${asset.browser_download_url}`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const installer = join(work, asset.name);
  writeFileSync(installer, Buffer.from(await res.arrayBuffer()));

  const out = join(work, "out");
  const r = spawnSync(sevenZip, ["x", "-y", `-o${out}`, installer, ENTRY], { stdio: "inherit" });
  if (r.status !== 0 || !existsSync(join(out, ENTRY))) {
    throw new Error("安装包里没有 RockoonIO.bmodp");
  }
  mkdirSync(dirname(TARGET), { recursive: true });
  copyFileSync(join(out, ENTRY), TARGET);
  console.log(`[fetch-bmodp] 已写入 ${TARGET}（来自 ${rel.tag_name}）`);
} catch (e) {
  console.error(`[fetch-bmodp] 失败：${e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
