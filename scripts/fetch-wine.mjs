// macOS 构建用：做一份精简的 Wine 运行时放进 Tauri 资源目录（tauri.macos.conf.json 的 before*Command 会跑）。
//
// Ballance 在 Mac 上靠 Wine 跑。启动器自带这份 Wine，第一次用时解到数据目录（src-tauri/src/commands/wine.rs），
// 玩家那边不用再联网下载。步骤：
//   1. 下载 Gcenx 的 macOS 构建（x86_64，带新 WoW64 能跑 32 位游戏；WineHQ 的 Homebrew cask 已在 2026-09 停用），
//      校验 sha256；原包缓存在 node_modules/.cache/rockoon-wine/；
//   2. 去掉游戏用不到的 Gecko（IE 内核）和 Mono（.NET），省 300 MB；
//   3. 附上 Wine 的许可证（LGPL 2.1，原文在 scripts/wine/）和源码出处；
//   4. 压成 src-tauri/resources-macos/wine/wine-runtime.tar.xz（约 75 MB），
//      旁边写 runtime.json（版本 + 压缩包 sha256，启动器靠它判断要不要重新解）。
//
// 换 Wine 版本：改下面三个常量，再实际跑一遍游戏。已经是这个版本就什么都不做；传 --force 强制重做。

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const WINE_VERSION = "11.18";
const WINE_URL = `https://github.com/Gcenx/macOS_Wine_builds/releases/download/${WINE_VERSION}/wine-devel-${WINE_VERSION}-osx64.tar.xz`;
const WINE_SHA256 = "aa0ea4c82e636ae7bca2076387cb0a5affa26509ad13f119ecd0d62bd7ba6f82";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src-tauri/resources-macos/wine");
const ARCHIVE = join(OUT_DIR, "wine-runtime.tar.xz");
const MANIFEST = join(OUT_DIR, "runtime.json");
const LICENSES = join(ROOT, "scripts/wine");
const CACHE = join(ROOT, "node_modules/.cache/rockoon-wine");

const log = msg => console.log(`[fetch-wine] ${msg}`);

if (process.platform !== "darwin") {
  console.error("[fetch-wine] 这是 macOS 构建用的（Gcenx 的 Wine 是 macOS 程序）");
  process.exit(1);
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

if (
  !process.argv.includes("--force") &&
  readManifest()?.version === WINE_VERSION &&
  existsSync(ARCHIVE)
) {
  log(`${ARCHIVE} 已是 Wine ${WINE_VERSION}，跳过`);
  process.exit(0);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} 失败（退出码 ${r.status}）`);
}

const hasXz = spawnSync("xz", ["--version"], { stdio: "ignore" }).status === 0;

/**
 * 把 `dir/name` 压成 tar.xz。不带扩展属性：macOS 的 tar 默认会把 xattr（包括下载来的隔离标记）
 * 一起打进去，解出来又还原回去。有 xz 就用它多线程压（快几倍），没有就用 tar 自带的单线程压缩。
 */
function packTarXz(dir, name, out) {
  const env = { COPYFILE_DISABLE: "1" };
  const tarArgs = ["--no-xattrs", "--no-mac-metadata", "-C", dir];
  if (hasXz) {
    run(
      "/bin/bash",
      [
        "-c",
        'set -o pipefail; /usr/bin/tar "${@:3}" -cf - "$1" | xz -T0 -c > "$2"',
        "pack",
        name,
        out,
        ...tarArgs
      ],
      env
    );
  } else {
    run("/usr/bin/tar", [...tarArgs, "-cJf", out, name], env);
  }
}

mkdirSync(CACHE, { recursive: true });
const original = join(CACHE, `wine-devel-${WINE_VERSION}-osx64.tar.xz`);
const work = mkdtempSync(join(tmpdir(), "rockoon-wine-"));
try {
  if (!existsSync(original) || (await sha256(original)) !== WINE_SHA256) {
    log(`下载 ${WINE_URL}（约 190 MB）`);
    const part = `${original}.part`;
    const res = await fetch(WINE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    const got = await sha256(part);
    if (got !== WINE_SHA256) {
      rmSync(part, { force: true });
      throw new Error(`sha256 不匹配：期望 ${WINE_SHA256}，实际 ${got}`);
    }
    renameSync(part, original);
  }

  log("解开、精简");
  run("/usr/bin/tar", ["-xf", original, "-C", work]);
  const res = join(work, "Wine Devel.app/Contents/Resources");
  const wine = join(res, "wine");
  if (!existsSync(join(wine, "bin/wine"))) {
    throw new Error("压缩包里没有 Wine Devel.app/Contents/Resources/wine/bin/wine");
  }
  for (const unused of ["share/wine/gecko", "share/wine/mono"]) {
    rmSync(join(wine, unused), { recursive: true, force: true });
  }
  // Gcenx 的包里没带许可证原文：LGPL 要求分发二进制时附上（取自 Wine 源码）
  for (const name of ["LICENSE", "COPYING.LIB"]) {
    copyFileSync(join(LICENSES, name), join(wine, name));
  }
  writeFileSync(
    join(wine, "SOURCE.txt"),
    [
      `This is the macOS build of Wine ${WINE_VERSION}, distributed under the GNU LGPL 2.1 (see LICENSE, COPYING.LIB).`,
      "",
      `- Source: https://gitlab.winehq.org/wine/wine/-/tree/wine-${WINE_VERSION}`,
      `- macOS build: https://github.com/Gcenx/macOS_Wine_builds/releases/tag/${WINE_VERSION}`,
      "- Repackaged by Rockoon (scripts/fetch-wine.mjs): share/wine/gecko and share/wine/mono were removed; nothing else was changed.",
      ""
    ].join("\n")
  );

  log(`压缩${hasXz ? "（xz 多线程）" : "（单线程，装了 xz 会快很多）"}`);
  const packed = join(work, "wine-runtime.tar.xz");
  packTarXz(res, "wine", packed);
  const sha = await sha256(packed);

  mkdirSync(OUT_DIR, { recursive: true });
  // 先删说明再换压缩包：中途被打断的话下次会重做，不会拿半截压缩包当成已完成
  rmSync(MANIFEST, { force: true });
  copyFileSync(packed, ARCHIVE);
  writeFileSync(MANIFEST, `${JSON.stringify({ version: WINE_VERSION, sha256: sha }, null, 2)}\n`);
  log(`已写入 ${ARCHIVE}（${(statSync(ARCHIVE).size / 1048576).toFixed(1)} MB，sha256 ${sha.slice(0, 12)}…）`);
} catch (e) {
  console.error(`[fetch-wine] 失败：${e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
