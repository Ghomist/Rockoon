// 构建时把下载站托管的原版游戏包（约 65.5 MB）取到 src-tauri/resources/game/。
//
// 安装原版游戏时启动器直接解压这份内置包（src-tauri/src/commands/game.rs），玩家那边
// 不用联网；恢复原版关卡素材（commands/vanilla.rs）也用这同一个包。包本身不进 git
// （见 .gitignore），发布出去的安装包 / dmg 里才有它。
//
// 每次构建前跑一次（tauri.conf.json / tauri.macos.conf.json 的 before*Command 已接好）；
// 本地文件已存在且 sha256 对得上就直接跳过，不联网。断线/假死会带 Range 从已下载的位置
// 接着下。传 --force 强制重新下载。
//
// 换原版包时的顺序：
//   1. 用 tools/gen-vanilla-assets.ps1 从新包重新生成 resources/vanilla/manifest.json；
//   2. 按 ballance-resource-hub/docs/vanilla-game.md 把新包传到下载站；
//   3. 改下面的 PIN（version / size / sha256，数据来自 GET /game/info）；
//   4. 跑 `pnpm fetch:game --force`。
//
// 下载站上的包和 PIN 不一致时直接报错，避免把「另一个版本的游戏」打进启动器 ——
// 内置包必须和入库的 manifest.json 是同一份，否则「恢复原版素材」恢复出来的就不是清单里的原版。

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const PIN = {
  version: "1.0",
  size: 68656006,
  sha256: "b019b2b1b83bc950148ba060d7ea8726f8660371d20dc30ed8967f8377fc0d0d"
};

/** 下载站主域名和备用域名（同一台后端，见 AGENTS.md「下载站有备用域名」） */
const ORIGINS = ["https://dl.ballance.top", "https://dl.bcrc.site"];

/** 一个包最多分几轮续传；一轮卡住（60 秒没数据）就换下一轮 */
const MAX_ATTEMPTS = 8;
const IDLE_TIMEOUT_MS = 60_000;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src-tauri/resources/game");
const TARGET = join(OUT_DIR, "ballance-original.zip");
const PART = `${TARGET}.part`;

const log = msg => console.log(`[fetch-game] ${msg}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function readInfo(origin) {
  const res = await fetch(`${origin}/game/info`, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "rockoon-fetch-game" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 本地已有正确的包：直接跳过 ─────────────────────────────
if (!process.argv.includes("--force") && existsSync(TARGET)) {
  const size = statSync(TARGET).size;
  if (size === PIN.size && (await sha256(TARGET)) === PIN.sha256) {
    log(`${TARGET} 已是原版游戏 ${PIN.version}，跳过`);
    process.exit(0);
  }
  log("本地内置包与 PIN 不一致，重新下载");
  rmSync(TARGET, { force: true });
  rmSync(PART, { force: true });
}
if (process.argv.includes("--force")) rmSync(PART, { force: true });

// ── 选一个能对上 PIN 的下载站 ──────────────────────────────
let origin = null;
let info = null;
const errors = [];
for (const candidate of ORIGINS) {
  try {
    const value = await readInfo(candidate);
    if (!value.available) {
      errors.push(`${candidate}：下载站上没有游戏包`);
      continue;
    }
    if (value.sha256 !== PIN.sha256 || value.size !== PIN.size) {
      // 站点上已经换了包：不能拿它顶替，否则会和入库的 manifest 对不上
      throw new Error(
        `下载站上的原版包和 PIN 不一致（version ${value.version}, size ${value.size}, ` +
          `sha256 ${value.sha256}）。请更新 scripts/fetch-game.mjs 的 PIN，` +
          "并用 tools/gen-vanilla-assets.ps1 重新生成 manifest.json。"
      );
    }
    origin = candidate;
    info = value;
    break;
  } catch (e) {
    errors.push(`${candidate}：${e.message}`);
  }
}

if (!origin) {
  console.error("[fetch-game] 拿不到原版游戏包：");
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

/**
 * 把 `url` 下到 `part`，中断后带 Range 续传。
 * 服务器没按 Range 回 206（例如被缓存层改成 200 整包）就清空重来，绝不把两份数据拼一起。
 */
async function downloadWithResume(url, part) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let received = existsSync(part) ? statSync(part).size : 0;
    if (received >= PIN.size) return;

    const headers = { "user-agent": "rockoon-fetch-game" };
    if (received > 0) headers.Range = `bytes=${received}-`;

    const controller = new AbortController();
    let idle = setTimeout(
      () =>
        controller.abort(new Error(`${IDLE_TIMEOUT_MS / 1000} 秒没有收到数据`)),
      IDLE_TIMEOUT_MS
    );
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // 206 且起点正好是已下载的位置才算续传；起点不对（缓存层/代理改了 Range）
      // 就清空重来，绝不能把两份数据拼在一起
      const startOf = res.headers.get("content-range")?.match(/^bytes (\d+)-/);
      const resuming =
        res.status === 206 && received > 0 && Number(startOf?.[1]) === received;
      if (resuming) {
        log(`从 ${(received / 1048576).toFixed(1)} MB 处续传`);
      } else {
        received = 0;
      }

      let nextLog = received + 8 * 1048576;
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          clearTimeout(idle);
          idle = setTimeout(
            () =>
              controller.abort(
                new Error(`${IDLE_TIMEOUT_MS / 1000} 秒没有收到数据`)
              ),
            IDLE_TIMEOUT_MS
          );
          if (received >= nextLog) {
            const percent = Math.min(
              100,
              Math.round((received / PIN.size) * 100)
            );
            log(`${percent}%（${(received / 1048576).toFixed(1)} MB）`);
            nextLog = received + 8 * 1048576;
          }
          callback(null, chunk);
        }
      });

      await pipeline(
        Readable.fromWeb(res.body),
        counter,
        createWriteStream(part, { flags: resuming ? "a" : "w" })
      );

      if (statSync(part).size === PIN.size) return;
      throw new Error(`下载不完整：${statSync(part).size}/${PIN.size} 字节`);
    } catch (e) {
      lastError = e;
      log(`第 ${attempt} 次下载中断：${e.message}`);
      await sleep(Math.min(1000 * attempt, 5000));
    } finally {
      clearTimeout(idle);
    }
  }
  throw lastError ?? new Error("下载失败");
}

// ── 下载并校验；校验失败时丢掉重来一次（防半截文件/换包时的脏续传） ──
try {
  mkdirSync(OUT_DIR, { recursive: true });
  const url = `${origin}/game/download`;
  log(`下载 ${url}（${(PIN.size / 1048576).toFixed(1)} MB）`);

  let ok = false;
  for (let round = 1; round <= 2 && !ok; round++) {
    await downloadWithResume(url, PART);
    const size = statSync(PART).size;
    const digest = await sha256(PART);
    if (size === PIN.size && digest === PIN.sha256) {
      // Windows 上 rename 到已存在的文件会失败；--force 时旧包还在，先删掉
      rmSync(TARGET, { force: true });
      renameSync(PART, TARGET);
      ok = true;
      log(
        `已写入 ${TARGET}（原版游戏 ${info.version}，sha256 ${digest.slice(0, 12)}…）`
      );
      break;
    }
    if (round === 1) {
      log(`校验失败（${size} 字节，sha256 ${digest}），丢弃后从头再下一次`);
      rmSync(PART, { force: true });
    } else {
      throw new Error(`sha256 校验失败：期望 ${PIN.sha256}，实际 ${digest}`);
    }
  }
} catch (e) {
  console.error(`[fetch-game] 失败：${e.message}`);
  process.exitCode = 1;
}
