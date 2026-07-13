# AGENTS.md

High-signal notes for OpenCode sessions working in this repo. Rockoon is a Ballance game launcher: Vue 3 + TypeScript frontend, Tauri 2.0 (Rust) backend, and a C++ BMLPlus native module. Windows-only. Deeper architecture notes live in `CLAUDE.md`.

## Commands

```bash
pnpm install          # must be pnpm (not npm/yarn)
pnpm tauri dev        # full dev: runs `pnpm dev` (vite :1420) + Rust backend. RUST_LOG=info preset.
pnpm dev              # frontend-only (vite, no backend)
pnpm build            # UI + C++ module (runs build:ui then build:bmodp)
pnpm build:ui         # vue-tsc --noEmit + vite build (type-check gates the build)
pnpm build:bmodp      # C++ module via src-bmodp/build.ps1
pnpm tauri build      # release bundle (nsis installer + updater artifacts)
pnpm lint             # eslint + prettier + stylelint (all with --fix)
pnpm icon             # regenerate app icons from public/logo.png
```

No test suite exists. Do not invent test commands; verify changes by running the app or `pnpm build:ui` (type-check).

## First-time setup gotchas

- **Git submodule**: `src-bmodp/3rd-party/Virtools-SDK-2.1` is a submodule. Clone with `git submodule update --init --recursive` before any C++ build.
- **BMLPlus SDK**: `build.ps1` auto-downloads it (version pinned in `src-bmodp/config.ps1`, currently v0.3.10) into `src-bmodp/3rd-party/BMLPlus/` on first build. Set `BMLP_PROXY` in `config.ps1` if behind a proxy.
- **C++ is 32-bit**: CMake invokes `-A Win32` because Ballance is a 32-bit game. The built `RockoonIO.bmodp` is copied to `src-tauri/resources/builtin-mods/` and bundled as a Tauri resource. Requires CMake 4.0+ and C++20.
- `pnpm tauri build` triggers `pnpm build` via `beforeBuildCommand`, so the C++ module rebuilds automatically — but only if the submodule is present.

## Architecture

Communication flow: `Vue Component → Store/Service → backend wrapper → tauri invoke → Rust #[command]`.

### Frontend (`src/`)

- **Backend abstraction (`src/backend/index.ts`)**: All `invoke()` calls live here, grouped into `common` / `ballance` / `fs` / `process`. Import `backend` from `@/backend` and call methods. **Never call `invoke()` directly** from components or stores.
- **Pinia stores (`src/stores/`)**: `app` (selected instance + running process), `instances`, `pref` (theme/lang/route), `hub` (auth token). `initStores()` in `stores/index.ts` wires debounced `$subscribe` persistence to localStorage and **watches `selectedInstanceData.options` deep, auto-writing back to the instance's `Database.tdb`** via the Rust backend — editing options has a side effect.
- **Services (`src/services/`)**: `launcher.ts` (composable `useLauncherService()`), `hub.ts` (REST client over `@tauri-apps/plugin-http`; default `http://127.0.0.1:8000`, configurable via `hubApiUrl` in pref store). All hub calls go through here.
- **Router (`src/routers/`)**: Routes are **auto-generated from `menu.ts`**, which also defines the sidebar. `createMemoryHistory()` (desktop, no URL bar).
- **i18n (`src/i18n/`)**: Auto-loads every JSON in `./languages/` (`en.json`, `zh.json`). Ctrl+T toggles language at runtime.
- **Logger (`src/utils/logger.ts`)**: Hooks all `console.*` and forwards to Rust via `backend.log()`. Frontend logs appear in the Rust log stream; set `RUST_LOG` for Rust-side level.
- **Global types (`src/types/*.d.ts`)**: `Instance`, `BallanceOptions`, `ModConfig`, etc. are ambient — no imports needed.
- Path alias: `@/` → `src/`.

### Backend (`src-tauri/`)

- Commands live in `src-tauri/src/commands/{app,fs,process,ballance}.rs` and are registered in `lib.rs` via `tauri::generate_handler![]`. Adding a command requires registering it there.
- Plugins enabled in `lib.rs`: http, updater, upload, single-instance, positioner, dialog, shell, opener.
- **Error types** (`src-tauri/src/common/exception.rs`): `RcError` is a `thiserror` enum with `From` impls for `io::Error`, `zip::ZipError`, `tauri::Error`. It serializes to a string for the frontend.
  - `RcResult = Result<(), RcError>` — use for void commands (no generic param).
  - `RcResultWith<T> = Result<T, RcError>` — use when returning data.
- Ballance logic (`src-tauri/src/ballance/`): `options.rs` reads/writes `Database.tdb` (game options + scores), `tdb/` is a custom Virtools DB parser, `mod_config.rs` handles BML/BMLPlus INI configs.
- Serde structs must use `#[serde(rename_all = "camelCase")]` so Rust snake_case maps to the TS frontend.
- `tauri.conf.json` (not `package.json`) holds the **app version** for releases/updater — currently `2.0.0-alpha8`; `package.json` version (`0.1.0`) is not the shipped version.

### C++ module (`src-bmodp/`)

BMLPlus plugin (`RockoonIO.bmodp`) built via CMake + `build.ps1`. Sources in `src/`, third-party in `3rd-party/` (Virtools-SDK submodule + downloaded BMLPlus SDK). `.clangd` present; CMake exports `compile_commands.json`.

## Style (non-defaults only)

- **Prettier**: double quotes, `arrowParens: "avoid"`, `trailingComma: "none"`, `bracketSpacing: true`.
- **ESLint**: flat config is `eslint.config.js` (the active one). `.eslintrc.js` is legacy — do not edit. `@typescript-eslint/no-explicit-any` is OFF. Unused vars/args prefixed with `_` are ignored. `consistent-type-imports` enforced (inline `import type`). Vue HTML elements always self-close (void/normal/component).
- **TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Target ES2022.
- Vue: `<script setup lang="ts">`. Reusable UI components use the `Basic` prefix. UI is **shadcn-vue** (Reka UI primitives + Tailwind v4) on top of `@/components/ui/*` (added via shadcn-vue CLI). Icons are `@lucide/vue` (kebab-case names, e.g. `<Rocket />`). Toasts via `vue-sonner`; modal dialogs via `@/utils/ui/dialog-store` + `GlobalDialogHost.vue`. Avoid adding any new UI library — extend the existing shadcn-vue set instead.
- Rust: `?` propagation, `thiserror` for errors, `log` crate macros (`info!`, etc.).

## Operational gotchas

- **Windows-only**: macOS/Linux are commented out in `.github/workflows/release.yml`.
- **Hot reload**: Vite ignores `src-tauri/**` (`vite.config.ts`). Rust changes require restarting `pnpm tauri dev`.
- **Vite port 1420 is strict** (`strictPort: true`) — if taken, dev fails rather than incrementing.
- **Release flow**: pushing to the `release` branch (or manual dispatch) triggers `release.yml`, which builds via `tauri-apps/tauri-action` with `submodules: recursive`, signs with `TAURI_SIGNING_PRIVATE_KEY` secret, and publishes a GitHub release tagged `rockoon-v<version>`. The updater pulls `latest.json` from that release.
- **Debugging Rust in VSCode**: `.vscode/launch.json` has CodeLLDB configs (`Tauri Development Debug` / `Tauri Production Debug`) with preLaunch tasks `ui:dev` / `ui:build`.
- **Vue LSP**: use `@vue/language-server` for `.vue` support.
