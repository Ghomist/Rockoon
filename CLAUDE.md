# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rockoon is a Ballance game launcher (All-in-One) built with Tauri 2.0 (Rust) + **React 18 + TypeScript** frontend and a C++ BMLPlus native module. It manages game instances, configurations, maps, mods, and imports community resource packages (BRP) from the resource hub. Windows-only.

> The frontend was migrated from Vue 3 to React: there are no `.vue` files left and the build type-checks with `tsc`, not `vue-tsc`. Older notes mentioning Vue / Pinia / Naive UI / shadcn-vue are obsolete.

## Development Commands

```bash
pnpm install          # Install dependencies (must use pnpm, not npm/yarn)
pnpm tauri dev        # Full development mode (frontend + Rust backend)
pnpm dev              # Frontend-only (Vite dev server on port 1420)
pnpm build            # Build complete app (UI + C++ module)
pnpm build:ui         # Build UI only (tsc --noEmit + vite build)
pnpm build:bmodp      # Build C++ BMLPlus native module (PowerShell script)
pnpm lint             # Run all linters (eslint + prettier + stylelint, with --fix)
```

There is no test suite. `pnpm build:ui` (type-check) plus running the app is how changes are verified.

## Architecture

### Communication Flow

```
React Component → Store/Service → Backend Wrapper → Tauri Invoke → Rust Command
```

### Frontend (`src/`)

**Backend abstraction** (`src/backend/index.ts`): All Tauri `invoke()` calls are centralized here. The default export merges four groups — `common` (log, window show/hide/toggle, devtools), `ballance` (read/save options, launch config, mod config), `fs` (file ops, unzip, disable/enable, skybox analysis, install built-in mod), `process` (execute/kill/check) — plus the BRP helpers (`validateBrp`, `importBrp`, `startBrpImport`, `cancelBrpImport`). Import `backend` and call methods directly; **never use `invoke()` in components or stores**, and every new command must be added to `lib.rs`'s `generate_handler![]`.

**Instance backend** (`src/backend/instance.ts`): Higher-level logic for detecting Ballance installations. `checkFiles()` walks `checklists` (`ballance` / `bml` / `bmlp` / `newPlayer`) to identify game files, detect mod loader type (BML/BMLPlus/none) and player type (original/new) — an array inside a checklist means "any of these files". Also produces default options and installs the built-in Rockoon mod.

**Stores** (`src/stores/`) — **zustand** (`create()`, `subscribeWithSelector` where selector subscriptions are needed):
- `app.ts` — selected instance data + running process state
- `pref.ts` — user preferences (theme/language/route), persisted through `src/utils/storage.ts` (localStorage wrapper) with a debounced save
- `profiles.ts` — option profiles stored inside the instance as `<instance>/.rockoon/profiles.json` (also reads/writes `Bin/Player.ini` and `ModLoader/Configs`)
- `stores/index.ts` — `initStores()` bootstraps everything: debounced pref persistence, restoring the last instance and its profiles, syncing the language, and **watching `selectedInstanceData.options` to write changes back into the instance's `Database.tdb`** via the Rust backend. Editing options therefore has a persistence side effect; don't add a second writer.

**Services** (`src/services/`): plain exported functions (not composables).
- `launcher.ts` — launch/kill the game and track playtime
- `brp.ts` — BRP resource package flow: validate → download (progress via Tauri events) → install, with cancel support; also hosts the category/label mapping used by the UI
- `updater.ts` — self-update through `@tauri-apps/plugin-updater`, surfaced with dialog/message helpers

**Router** (`src/routers/`): `menu.ts` is the single source of truth — it declares sidebar items (including `-` separators and external links) and maps leaf items to view components via `getMenuItems()`. `index.tsx` turns that into the `<Route>` tree (group items nest children with absolute paths, unknown paths redirect to `/game`) and remounts on navigation to replay the enter animation. `<MemoryRouter>` in `main.tsx` — desktop app, no URL bar. Adding a page means editing `menu.ts` and `src/i18n`.

**i18n** (`src/i18n/index.ts`): zustand-based; eagerly globs `./languages/*.json` (`en.json`, `zh.json`), exposes `t()` with dotted keys and `{param}` interpolation, falls back to English, and reacts to `pref.language` changes.

**Logger** (`src/utils/logger.ts`): `registerLoggers()` hooks `console.*` (and `unhandledrejection`) and forwards to Rust via `backend.log()`, so frontend logs land in the Rust log stream. `RUST_LOG` controls the Rust-side level.

**UI layer**: shadcn primitives (React, "new-york", CSS variables) in `src/components/ui/`, app components in `src/components/` (`AppSidebar`, `TitleBarControls`, `GlobalDialogHost`, `ImportProgressDialog`), Tailwind v4 through `@tailwindcss/vite`, `cn()` from `@/lib/utils`, icons from `lucide-react`, toasts from `sonner`, dialogs/messages from `@/utils/ui/feedback` + `@/utils/ui/dialog-store`. Extend these; do not introduce another UI library.

**Global types** (`src/types/*.d.ts`): ambient declarations (`Instance`, `BallanceOptions`, `ModConfig`, BRP types) — no imports required. Path alias `@/` → `src/`.

### Backend (`src-tauri/`)

**Rust commands** (`src-tauri/src/commands/`): organized into `app`, `fs`, `process`, `ballance`, `brp` modules; all registered in `lib.rs` via `tauri::generate_handler![]`.

- `#[command]` macro, `async` where the body awaits
- Return types: `RcResult` for void, `RcResultWith<T>` for data
- Error handling via `common/exception.rs` — `RcError` enum (thiserror) with `From` impls for IO/Zip/Tauri errors, serialized as a string to the frontend
- Serde structs use `#[serde(rename_all = "camelCase")]` to match the TS side

**Ballance logic** (`src-tauri/src/ballance/`):
- `options.rs` — reads/writes game options from `Database.tdb`
- `tdb/` — custom TDB (Virtools database) parser
- `mod_config.rs` — reads/writes BML/BMLPlus INI-style mod configs
- `brp.rs` — BRP package validation and installation, including the cancellable download/install task

**Tauri plugins** (configured in `lib.rs`): http, updater, upload, single-instance, positioner, dialog, shell, deep-link.

**Versioning**: the shipped version (releases, updater manifest) comes from `src-tauri/tauri.conf.json`, not `package.json`.

### C++ Module (`src-bmodp/`)

BMLPlus native module built via CMake + PowerShell (`build.ps1`), compiled 32-bit (`-A Win32`) because Ballance is a 32-bit game. Shipped as `RockoonIO.bmodp` under `src-tauri/resources/builtin-mods/` and auto-installed into game instances. Requires the `3rd-party/Virtools-SDK-2.1` submodule; the BMLPlus SDK is downloaded on first build.

## Key Patterns

- **Two-phase resource import (BRP)**: validate the archive against the target instance first, then download/install asynchronously (`startBrpImport` returns a task id, progress arrives via Tauri events, `cancelBrpImport` aborts). Keep long work off the UI thread — earlier versions froze the window when the IPC call blocked.
- **Auto-save options**: the watcher in `stores/index.ts` is the only place that writes `Database.tdb`.
- **Store persistence**: localStorage through `src/utils/storage.ts`; saves are debounced.
- **File operations** always go through the Rust backend (security model) — no direct filesystem access from the frontend.
- **Game files**: `Database.tdb` = game options/scores, `Options.ini` = mod config, `Player.exe` = game executable.

## Important Gotchas

- **Package manager**: Must use `pnpm`
- **Platform**: Windows only (macOS/Linux builds disabled in `release.yml`; C++ is 32-bit)
- **Hot reload**: Rust changes require restarting `pnpm tauri dev` (Vite ignores `src-tauri/`)
- **Vite port**: Fixed at 1420 (`strictPort: true`) — dev fails instead of picking another port
- **Logging**: all `console.*` calls are hooked and forwarded to Rust; set `RUST_LOG` for Rust-side level
- **TypeScript**: `strict` + `noUnusedLocals`/`noUnusedParameters` — unused imports break `pnpm build:ui`
- **Tooling dirs** `.wolf/`, `.omo/`: OpenWolf session logs (`memory.md`, `buglog.json`) are auto-generated edit trails, not an authoritative description of the code or of real bugs

## Code Style

- Prettier: double quotes, `arrowParens: "avoid"`, `trailingComma: "none"`
- ESLint: flat config `eslint.config.js` only; `@typescript-eslint/no-explicit-any: OFF`; unused vars prefixed `_` are ignored; inline `import type`
- TypeScript: strict mode, unused locals/parameters enforced
- React: function components + hooks, `PascalCase` `.tsx` files, JSX elements self-close
- Rust: Serde structs with `#[serde(rename_all = "camelCase")]`, `?` propagation, `log` macros
- UI: shadcn (React) + Tailwind v4 + `lucide-react` for all components — extend the existing set, do not add another UI library
