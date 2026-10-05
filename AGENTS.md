# AGENTS.md

High-signal notes for AI coding sessions in this repo. Rockoon is a Ballance game launcher: **React 18 + TypeScript** frontend, Tauri 2.0 (Rust) backend, and a C++ BMLPlus native module. Windows-only. Deeper architecture notes live in `CLAUDE.md`.

> **Frontend is React, not Vue.** The codebase was migrated from Vue 3 to React; `src/` contains **no `.vue` files** and type-checking uses `tsc`, not `vue-tsc`. Any remaining mention of Vue / Pinia / Naive UI / shadcn-vue anywhere in this repo (including `.wolf/` logs) is stale — trust the code.

## Commands

```bash
pnpm install          # must be pnpm (not npm/yarn)
pnpm tauri dev        # full dev: runs `pnpm dev` (vite :1420) + Rust backend. RUST_LOG=info preset.
pnpm dev              # frontend-only (vite, no backend)
pnpm build            # UI + C++ module (runs build:ui then build:bmodp)
pnpm build:ui         # tsc --noEmit + vite build (type-check gates the build)
pnpm build:bmodp      # C++ module via src-bmodp/build.ps1
pnpm tauri build      # release bundle (nsis installer + updater artifacts)
pnpm lint             # eslint + prettier + stylelint (all with --fix)
pnpm icon             # regenerate app icons from public/logo.png
pnpm update-all       # pnpm update + cargo update
```

No test suite exists. Do not invent test commands; verify changes by running the app or `pnpm build:ui` (type-check).

## First-time setup gotchas

- **Git submodule**: `src-bmodp/3rd-party/Virtools-SDK-2.1` is a submodule. Clone with `git submodule update --init --recursive` before any C++ build.
- **BMLPlus SDK**: `build.ps1` auto-downloads it (version pinned in `src-bmodp/config.ps1`) into `src-bmodp/3rd-party/BMLPlus/` on first build. Set `BMLP_PROXY` in `config.ps1` if behind a proxy.
- **C++ is 32-bit**: CMake invokes `-A Win32` because Ballance is a 32-bit game. The built `RockoonIO.bmodp` is copied to `src-tauri/resources/builtin-mods/` and bundled as a Tauri resource. Requires CMake 4.0+ and C++20.
- `pnpm tauri build` triggers `pnpm build` via `beforeBuildCommand`, so the C++ module rebuilds automatically — but only if the submodule is present.

## Architecture

Communication flow: `React Component → store/service → src/backend wrapper → tauri invoke → Rust #[command]`.

### Frontend (`src/`)

- **Backend abstraction (`src/backend/index.ts`)**: All `invoke()` calls live here. The default export merges four groups: `common` (log, window, devtools), `ballance` (options, launch config, mod config), `fs` (file ops, unzip, skybox analysis), `process` (execute/kill/check), plus BRP helpers (`validateBrp`, `importBrp`, `startBrpImport`, `cancelBrpImport`). Import `backend` from `@/backend` and call methods. **Never call `invoke()` directly** from components or stores.
- **Instance detection (`src/backend/instance.ts`)**: `instanceBackend` uses file `checklists` (`ballance` / `bml` / `bmlp` / `newPlayer`) to identify a game folder; arrays in a checklist mean "any of these files". Also builds default options and installs the built-in mod.
- **Stores (`src/stores/`)** — **zustand** (`create()`, some with `subscribeWithSelector`): `app` (selected instance + running process), `pref` (theme/lang/route, persisted to localStorage via `utils/storage.ts`), `profiles` (option profiles persisted to `<instance>/.rockoon/profiles.json`, plus `Bin/Player.ini` and `ModLoader/Configs` handling). `initStores()` in `stores/index.ts` wires debounced persistence, restores the last instance, syncs language, and **watches `selectedInstanceData.options` — changes are written back to the instance's `Database.tdb`** through the Rust backend, so editing options has a side effect.
- **Services (`src/services/`)**: plain functions, no composables. `launcher.ts` (launch/kill instance), `brp.ts` (BRP resource import: validate → download with progress events → install, cancellable), `updater.ts` (self-update via `@tauri-apps/plugin-updater`).
- **Router (`src/routers/`)**: `menu.ts` defines the sidebar menu **and** the route→component mapping (group items nest children, `"-"` entries are separators); `index.tsx` builds the `<Route>` tree from it. `<MemoryRouter>` in `main.tsx` (desktop, no URL bar). Adding a page = add an entry to `menu.ts`, no separate route file.
- **i18n (`src/i18n/index.ts`)**: zustand-based; eagerly globs `src/i18n/languages/*.json` (`en.json`, `zh.json`), exposes `t()` with dotted keys and `{param}` interpolation, falls back to English, and follows `pref.language`.
- **Logger (`src/utils/logger.ts`)**: `registerLoggers()` hooks all `console.*` and forwards to Rust via `backend.log()`. Frontend logs appear in the Rust log stream; set `RUST_LOG` for Rust-side level.
- **Global types (`src/types/*.d.ts`)**: `Instance`, `BallanceOptions`, `ModConfig`, BRP types, etc. are ambient — no imports needed.
- Path alias: `@/` → `src/`.

### Backend (`src-tauri/`)

- Commands live in `src-tauri/src/commands/{app,fs,process,ballance,brp}.rs` and are registered in `lib.rs` via `tauri::generate_handler![]`. Adding a command requires registering it there.
- Plugins enabled in `lib.rs`: http, updater, upload, single-instance, positioner, dialog, shell, deep-link.
- **Error types** (`src-tauri/src/common/exception.rs`): `RcError` is a `thiserror` enum with `From` impls for `io::Error`, `zip::ZipError`, `tauri::Error`. It serializes to a string for the frontend.
  - `RcResult = Result<(), RcError>` — use for void commands (no generic param).
  - `RcResultWith<T> = Result<T, RcError>` — use when returning data.
- Ballance logic (`src-tauri/src/ballance/`): `options.rs` reads/writes `Database.tdb` (game options + scores), `tdb/` is a custom Virtools DB parser, `mod_config.rs` handles BML/BMLPlus INI configs, `brp.rs` validates/installs BRP resource packages.
- **BRP 模组（`category: "mod"`）**：一个包里可以同时带 `.bmod`（老 BML）与 `.bmodp`（BML+）两份产物 —— 两种加载器各自只认自己的扩展名（BML+ 的 `ExploreMods` 只挑 `.zip`/`.bmodp`，老 BML 只挑 `.bmod`），对方的文件放着无害。安装时按实例**启用中**的加载器（`BuildingBlocks/BMLPlus.dll` / `BML.dll`，`.disable` 不算数）只装匹配的那一份；包里没匹配的就把现有的装上并置 `modVariantMismatch`（前端提示用户）；没有加载器时两份都装。目标目录与老类别一致：`ModLoader/Mods/`。`bmod`/`bmodp` 类别保留兼容。下载站侧规则见 `ballance-resource-hub/docs/mod-category.md`。
- Serde structs must use `#[serde(rename_all = "camelCase")]` so Rust snake_case maps to the TS frontend.
- `tauri.conf.json` (not `package.json`) holds the **app version** for releases/updater — currently `2.1.0`; `package.json` version (`0.1.0`) is not the shipped version.

### C++ module (`src-bmodp/`)

BMLPlus plugin (`RockoonIO.bmodp`) built via CMake + `build.ps1`. Sources in `src/`, third-party in `3rd-party/` (Virtools-SDK submodule + downloaded BMLPlus SDK). `.clangd` present; CMake exports `compile_commands.json`.

## Style (non-defaults only)

- **Prettier** (`.prettierrc.js`): double quotes, `arrowParens: "avoid"`, `trailingComma: "none"`, `bracketSpacing: true`.
- **ESLint**: flat config in `eslint.config.js` is the only active config (`.eslintrc.js` has been removed). JSX elements self-close. `@typescript-eslint/no-explicit-any` is OFF. Unused vars/args prefixed with `_` are ignored. `consistent-type-imports` enforced (inline `import type`).
- **TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — unused imports/vars fail `pnpm build:ui`. Target ES2022.
- React: function components with hooks (`export default function View()`); TSX files are `PascalCase` (`src/views/GameConfig.tsx`) and re-exported through `routers/menu.ts`. Reusable UI components live in `src/components/`, primitives in `src/components/ui/`.
- UI is **shadcn (React, "new-york" style)** on Tailwind v4 (`components.json`, CSS variables in `src/assets/styles.css`, `cn()` in `@/lib/utils`) — add primitives via the shadcn CLI, do not hand-roll them. Icons are `lucide-react`. Toasts via `sonner`. Dialogs/messages via `@/utils/ui/feedback` + `@/utils/ui/dialog-store` and `GlobalDialogHost.tsx`. **Do not add another UI library** — extend the existing shadcn set.
- Rust: `?` propagation, `thiserror` for errors, `log` crate macros (`info!`, etc.).

## Patches (download-site patches)

补丁页（`/patches`）不是本地文件管理页：它对接下载站的补丁资源（BML / BML+ / 新 Player）。

- **清单来源**：`GET https://dl.ballance.top/patches`。每一项自带安装提示：
  `install_target`（`game` = 游戏根 / `bin` = 游戏根下的 Bin）、`strip_top_level`
  （上游包外层是否多套一层目录，新 Player 包是）、`marker`（装完用来校验的文件）。
  启动器不写死组件清单 —— 新增补丁只改下载站配置。
- **版本号有两套，别弄混**：`GET /packages/{id}/versions` 里 `version` 是文件序号
  （1、2、3…，用于下载与删除），`note` 才是与上游 GitHub 对齐的版本号（如 `v0.3.13`）。
  下载地址用序号：`/packages/{id}/versions/{序号}/download`；传 tag 会 422。
  对用户展示、与 `latest` 对比、记录已装版本，都用 `note`。
- **安装**：`backend.patches.install(url, targetDir, stripTopLevel)` → Rust
  `start_patch_install`，与原版游戏安装共用 `game-install:*` 事件与 `cancelInstall`。
  装完校验 `marker` 是否存在，然后把版本记进 pref store 的 `patchVersions`。
- **更新提醒**：`PatchUpdateWatcher` 启动时只检查**装过的**补丁（没装过的不打扰，
  安装入口在补丁页）；用户点「稍后」会把版本写进 `seenPatchVersions`，同一版本不再提示。
- **装原版游戏时**会先弹 `PatchOptionsDialog`，默认勾选新 Player + BML+（BML+ 依赖
  新 Player，按这个顺序装），失败不推翻已装好的游戏，只提示去补丁页重试。
- 手动装的补丁没有版本记录：界面显示「已安装（版本未知）」，更新按钮仍可用。

## Operational gotchas

- **前端直连下载站要改 CSP**：`tauri.conf.json` 的 `app.security.csp` 必须写上
  `connect-src ... https://dl.ballance.top`，否则 webview 里的 `fetch` 会被
  `default-src 'self'` 静默拦截（只在 webview 控制台报错，业务代码只会看到网络失败）。
  历史上所有网络请求都走 Rust（ureq，不受 CSP 管），所以这是加「补丁页 / 深链读依赖」
  时第一次踩到的坑。同理，以后要显示远程图片得加 `img-src`。
- **本地音效预览要 `media-src`**：`<audio>`（HTMLMediaElement）受 **`media-src`** 管，不受
  `img-src` / `connect-src` 管。`convertFileSrc()` 生成的是**另一个源**的 URL
  （Windows 上 `http://asset.localhost/...`），所以只给 `img-src` 放行时，图片能显示、
  音频却会被 `default-src 'self'` 拦掉，报 `NotSupportedError` + 控制台一条
  `securitypolicyviolation (media-src)`，业务代码只看到「播放失败」。
  修法：`media-src 'self' asset: http://asset.localhost`（与 `img-src` 同源列表）。
  验证方法：`.local-logs/audio-csp-test/` —— 两个端口的双源复现（页面带/不带 `media-src`），
  用无头 Edge 抓 DOM 看 `play()` 结果与 `csp-violation` 事件。
- **CSP 会连内联脚本一起拦**：`default-src 'self'` 下 `securitypolicyviolation` 之外的
  内联 `<script>` 不执行 —— 写临时验证页时要外链 JS，否则页面看起来「没反应」。
- **Windows-only**: macOS/Linux are commented out in `.github/workflows/release.yml`.
- **Hot reload**: Vite ignores `src-tauri/**` (`vite.config.ts`). Rust changes require restarting `pnpm tauri dev`.
- **Vite port 1420 is strict** (`strictPort: true`) — if taken, dev fails rather than incrementing.
- **Release flow**: pushing to the `release` branch (or manual dispatch) triggers `release.yml`, which builds via `tauri-apps/tauri-action` with `submodules: recursive`, signs with `TAURI_SIGNING_PRIVATE_KEY` secret, and publishes a GitHub release tagged `rockoon-v<version>`. The updater pulls `latest.json` from that release.
- **Debugging Rust in VSCode**: `.vscode/launch.json` has CodeLLDB configs (`Tauri Development Debug` / `Tauri Production Debug`) with preLaunch tasks `ui:dev` / `ui:build`.
- **File operations** go through the Rust backend (security model) — no direct filesystem access from the frontend.
- **Game files**: `Database.tdb` = game options/scores, `Options.ini` = mod config, `Player.exe` = game executable.
- Tooling dirs `.wolf/`, `.omo/` hold OpenWolf session logs (`memory.md`, `buglog.json`) that are auto-generated edit trails, **not** a reliable description of the current code or of real bugs.
