# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rockoon is a Ballance game launcher (All-in-One) built with Tauri 2.0 (Rust) + Vue 3 + TypeScript. It manages game instances, configurations, maps, mods, and provides a resource hub for downloading/uploading community content.

## Development Commands

```bash
pnpm install          # Install dependencies (must use pnpm, not npm/yarn)
pnpm tauri dev        # Full development mode (frontend + Rust backend)
pnpm dev              # Frontend-only (Vite dev server on port 1420)
pnpm build            # Build complete app (UI + C++ module)
pnpm build:ui         # Build UI only (vue-tsc type-check + vite build)
pnpm build:bmodp      # Build C++ BMLPlus native module (PowerShell script)
pnpm lint             # Run all linters (eslint + prettier + stylelint)
```

## Architecture

### Communication Flow

```
Vue Component → Store/Service → Backend Wrapper → Tauri Invoke → Rust Command
```

### Frontend (`src/`)

**Backend abstraction** (`src/backend/index.ts`): All Tauri invoke calls are centralized here in four groups: `common` (log, window), `ballance` (options, launch config, mod config), `fs` (file operations), `process` (execute/kill/check). Import `backend` and call methods directly — never use `invoke()` in components or stores.

**Instance backend** (`src/backend/instance.ts`): Higher-level logic for detecting Ballance installations. Uses checklists to identify game files, detect mod loader type (BML/BMLPlus/none), and player type (original/new). Scans common directories up to 2 levels deep.

**Pinia stores** (`src/stores/`):
- `app` — selected instance, running game process state
- `instances` — instance list persisted to localStorage via `src/utils/storage.ts`
- `pref` — user preferences persisted to localStorage, includes theme/language/route
- `hub` — hub auth token (composition API style store)
- `stores/index.ts` — `initStores()` bootstraps all stores, sets up auto-save subscriptions, selects default instance, and watches options changes to write back to `Database.tdb`

**Services** (`src/services/`):
- `launcher.ts` — composable (`useLauncherService()`) for launching/killing game instances, tracking playtime
- `hub.ts` — REST API client for the resource hub, uses `@tauri-apps/plugin-http` for fetch. Default endpoint `http://127.0.0.1:8000`, configurable via `hubApiUrl` in pref store. All hub API calls are here

**Router** (`src/routers/`): Routes are auto-generated from `menu.ts`. Uses `createMemoryHistory()` (desktop-only, no URL bar). `menu.ts` defines both the sidebar menu structure and the route/component mapping.

**i18n** (`src/i18n/`): Auto-loads all JSON files from `./languages/` (currently `en.json`, `zh.json`). Toggle language at runtime with Ctrl+T.

**Logger** (`src/utils/logger.ts`): Hooks all `console.*` methods to forward logs to Rust backend via `backend.log()`.

### Backend (`src-tauri/`)

**Rust commands** (`src-tauri/src/commands/`): Organized into `app`, `fs`, `process`, `ballance` modules. All registered in `lib.rs` via `tauri::generate_handler![]`.

- Use `#[command]` macro for Tauri commands
- Return types: `RcResult<()>` for void, `RcResultWith<T>` for data
- Error handling via `common/exception.rs` — `RcError` enum with automatic `From` impls for IO/Zip/Tauri errors

**Ballance logic** (`src-tauri/src/ballance/`):
- `options.rs` — reads/writes game options from `Database.tdb`
- `tdb/` — custom TDB (Virtools database) parser
- `mod_config.rs` — reads/writes BML/BMLPlus INI-style mod configs

**Tauri plugins** (configured in `lib.rs`): single-instance, positioner, dialog, shell, HTTP, updater, upload.

### C++ Module (`src-bmodp/`)

BMLPlus native module built via CMake + PowerShell (`build.ps1`). Shipped as `RockoonIO.bmodp` and auto-installed to game instances.

## Key Patterns

- **Instance detection**: `checkFiles()` in `instance.ts` uses checklists (`ballance`, `bml`, `bmlp`, `newPlayer`) to determine what a game folder contains. Arrays in checklists mean "any of these files".
- **Auto-save options**: A watcher in `stores/index.ts` detects changes to `selectedInstanceData.options` and writes back to `Database.tdb` via the Rust backend.
- **Store persistence**: Stores use `storage.ts` (localStorage wrapper) with debounced `$subscribe` saves.
- **Hub auth**: `HubStore` holds a JWT token in localStorage. Hub service functions use `authRequest()` which injects `Authorization: Bearer` headers.

## Important Gotchas

- **Package manager**: Must use `pnpm` (project uses workspaces)
- **Platform**: Windows only (macOS/Linux builds disabled)
- **Hot reload**: Rust changes require restart of `pnpm tauri dev` (Vite ignores `src-tauri/`)
- **Vite port**: Fixed at 1420 (strictPort: true)
- **Logging**: All `console.*` calls are hooked and forwarded to Rust; set `RUST_LOG` env var for Rust-side log level
- **TypeScript paths**: Use `@/` alias for `src/` imports
- **Vue components**: Use `<script setup lang="ts">` syntax
- **File operations**: All go through Rust backend (security model) — no direct filesystem access from frontend
- **Type definitions**: Global types in `src/types/*.d.ts` (no imports needed for `Instance`, `BallanceOptions`, etc.)
- **Game files**: `Database.tdb` = game options/scores, `Options.ini` = mod config, `Player.exe` = game executable

## Code Style

- Prettier: double quotes, no arrow parens for single arg, no trailing commas
- ESLint: `@typescript-eslint/no-explicit-any: OFF`, Vue HTML self-closing
- TypeScript: strict mode, unused locals/parameters enforced
- Rust: Serde structs use `#[serde(rename_all = "camelCase")]`
- Naive UI for all UI components
