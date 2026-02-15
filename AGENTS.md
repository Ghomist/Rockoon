# AGENTS.md

## Project Overview

Rockoon is a Ballance game launcher built with:

- **Frontend**: Vue 3 + TypeScript + Vite + Naive UI
- **Backend**: Tauri 2.0 (Rust)
- **Native Module**: C++ (.bmodp) using BMLPlus SDK
- **Package Manager**: pnpm

## Essential Commands

### Development

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Full Tauri development (frontend + backend)
pnpm dev              # Frontend-only (Vite dev server)
pnpm build            # Build complete application (UI + C++ module)
pnpm build:ui         # Build UI only
pnpm build:bmodp      # Build C++ module
```

### Linting & Formatting

```bash
pnpm lint             # Run all linting (eslint + prettier + stylelint)
pnpm lint:eslint      # Vue/TS linting with auto-fix
pnpm lint:prettier    # Code formatting
pnpm lint:stylelint   # CSS/SCSS styling
```

### Tauri Commands

```bash
pnpm tauri build      # Build Tauri app (release)
pnpm icon             # Generate app icon
```

### Testing

**No test suite exists** - Manual testing is performed during development.

## Code Style Guidelines

### Vue/TypeScript

#### Component Structure

- Use `<script setup lang="ts">` syntax
- Import from `@/` alias (maps to `src/`)
- Components use "Basic" prefix for reusable UI elements
- Props defined with TypeScript interfaces

```typescript
import { instanceBackend } from "@/backend/instance";
export const useAppStore = defineStore("app", {
  state: (): AppStore => ({ ... }),
  getters: { ... },
  actions: { ... }
});
// HMR support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
```

#### Tauri Communication

All backend calls go through `@/backend/index.ts`:

```typescript
import backend from "@/backend";
await backend.exists(path);
await backend.saveOptions(dbPath, options);
```

### Rust

#### Command Pattern

```rust
use tauri::command;
use crate::common::exception::{RcResult, RcResultWith};

#[command]
pub fn read_options(path: String) -> RcResultWith<BallanceOptions> {
    let mut options = BallanceOptions::new();
    options.read_from(&path)?;
    info!("Read options from {}", path);
    Ok(options)
}
```

Return types: `RcResult<()>` (success/error), `RcResultWith<T>` (success with data)

#### Error Handling

- Custom types in `common/exception.rs`: `RcResult<T> = Result<T, Box<dyn Error>>`
- Use `?` operator for propagation
- Serde structs use `#[serde(rename_all = "camelCase")]`

### Formatting & Linting

#### Prettier Config

```javascript
{
  singleQuote: false,      // Use double quotes
  arrowParens: "avoid",    // No parens for single arg
  trailingComma: "none"     // No trailing commas
}
```

#### ESLint Rules

- `@typescript-eslint/no-explicit-any`: OFF
- Vue HTML elements always self-close
- Unused variables with `_` prefix ignored
- Consistent type imports enforced

#### TypeScript Config

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
}
```

## Architecture Patterns

### Communication Flow

```
Vue Component → Store/Service → Backend Wrapper → Tauri Invoke → Rust Command
```

### Key Patterns

- **Pinia stores**: Persisted to local storage, debounced saves, HMR supported
- **Services**: Use `defineService` singleton pattern with `withCache`, `withDebounce`
- **File ops**: All go through Rust backend (security model)
- **Router**: `createMemoryHistory()` for desktop, auto-generated from `routers/menu.ts`
- **i18n**: Language files in `src/i18n/languages/*.json`, use `t("key.path")` in templates

## Important Gotchas

- **Must use pnpm** (not npm/yarn)
- **Windows only** - macOS/Linux builds disabled in CI
- **Tauri dev** ignores `src-tauri` for hot reload (restart for Rust changes)
- **Vite port**: 1420 (strict)
- **Logging**: Frontend console calls forward to Rust backend; set `RUST_LOG` env var
- **Vue LSP**: Use `@vue/language-server` for Vue file language server support

## Dependencies Key Versions

- Node.js: v22.13.1 | pnpm: 9.15.4 | Rust: stable (cargo 1.84.0)
- Tauri: 2.x | Vue: 3.5.17 | TypeScript: 5.6.3
- CMake: 4.0+ | C++: C++20

## Project Structure

```
rockoon/
├── src/                 # Vue.js frontend (components, stores, services, views)
├── src-tauri/           # Rust backend (commands/, ballance/, common/)
├── src-bmodp/           # C++ BMLPlus module (CMakeLists.txt, src/)
├── public/              # Static assets
└── package.json         # JS dependencies and scripts
```
