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

## Operational gotchas

- **Windows-only**: macOS/Linux are commented out in `.github/workflows/release.yml`.
- **Hot reload**: Vite ignores `src-tauri/**` (`vite.config.ts`). Rust changes require restarting `pnpm tauri dev`.
- **Vite port 1420 is strict** (`strictPort: true`) — if taken, dev fails rather than incrementing.
- **Release flow**: pushing to the `release` branch (or manual dispatch) triggers `release.yml`, which builds via `tauri-apps/tauri-action` with `submodules: recursive`, signs with `TAURI_SIGNING_PRIVATE_KEY` secret, and publishes a GitHub release tagged `rockoon-v<version>`. The updater pulls `latest.json` from that release.
- **Debugging Rust in VSCode**: `.vscode/launch.json` has CodeLLDB configs (`Tauri Development Debug` / `Tauri Production Debug`) with preLaunch tasks `ui:dev` / `ui:build`.
- **File operations** go through the Rust backend (security model) — no direct filesystem access from the frontend.
- **Game files**: `Database.tdb` = game options/scores, `Options.ini` = mod config, `Player.exe` = game executable.
- Tooling dirs `.wolf/`, `.omo/` hold OpenWolf session logs (`memory.md`, `buglog.json`) that are auto-generated edit trails, **not** a reliable description of the current code or of real bugs.
