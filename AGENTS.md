# AGENTS.md

## Project Overview

Rockoon is an all-in-one Ballance game launcher built with:
- **Frontend**: Vue 3 + TypeScript + Vite + Naive UI
- **Backend**: Tauri 2.0 (Rust)
- **Native Module**: C++ DLL (.bmodp) using BMLPlus SDK
- **Package Manager**: pnpm

The launcher provides game management, mod support, map downloads, and configuration management for Ballance.

## Essential Commands

### Development
```bash
# Install dependencies
pnpm install

# Full Tauri development (frontend + backend)
pnpm tauri dev

# Frontend-only development (Vite dev server)
pnpm dev

# Build complete application
pnpm build

# Build UI only
pnpm build:ui

# Build C++ module (BMLPlus)
pnpm build:bmodp
```

### Linting & Formatting
```bash
# Run all linting
pnpm lint

# Individual linters
pnpm lint:eslint    # Vue/TS linting with auto-fix
pnpm lint:prettier  # Code formatting
pnpm lint:stylelint # CSS/SCSS styling

# Update dependencies
pnpm update-all     # Updates both JS and Rust dependencies
```

### Tauri Commands
```bash
# Generate app icon
pnpm icon

# Build Tauri app (release)
pnpm tauri build

# Run Tauri app (debug)
pnpm tauri dev
```

### C++ Module (src-bmodp/)
```bash
# Generate Visual Studio project
cmake . -B build -A Win32

# Build the module
cmake --build build --config Release

# Or use the provided script
build.bat
```

## Project Structure

```
rockoon/
├── src/                      # Vue.js frontend source
│   ├── assets/              # Static assets (styles, themes)
│   ├── backend/             # Tauri command wrappers
│   │   ├── index.ts         # Main backend export (common, ballance, fs, process)
│   │   ├── instance.ts      # Instance-specific backend logic
│   │   └── utils.ts         # Backend utility functions
│   ├── components/          # Reusable Vue components (Basic*)
│   ├── i18n/                # Internationalization (en.json, zh.json)
│   ├── routers/             # Vue Router configuration
│   │   ├── index.ts         # Router setup with memory history
│   │   └── menu.ts          # Menu structure mapping
│   ├── services/            # Business logic services
│   │   ├── download.ts      # Download service with caching
│   │   └── launcher.ts      # Game launcher logic
│   ├── stores/              # Pinia state management
│   │   ├── app.ts           # Global app state
│   │   ├── instances.ts     # Instance list management
│   │   ├── pref.ts          # User preferences
│   │   └── index.ts         # Store initialization
│   ├── types/               # TypeScript type definitions
│   │   ├── ballance.d.ts    # Ballance-specific types
│   │   ├── common.d.ts      # Common types
│   │   ├── file.d.ts        # File system types
│   │   └── store.d.ts       # Store state types
│   ├── utils/               # Utility functions
│   │   ├── common.ts        # Common utilities (sleep, debounce, cache, service)
│   │   ├── format.ts        # Formatting utilities
│   │   ├── http.ts          # HTTP client (Tauri fetch wrapper)
│   │   ├── logger.ts        # Logger that forwards to Rust backend
│   │   ├── storage.ts       # Local storage helpers
│   │   └── ui/              # UI-specific utilities
│   ├── views/               # Page components
│   │   ├── instances/       # Instance management pages
│   │   ├── download/        # Download pages (maps, mods, game)
│   │   ├── settings/        # Settings page
│   │   └── ...              # Other view pages
│   ├── App.vue              # Root application component
│   └── main.ts              # Application entry point
├── src-tauri/               # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # Tauri app setup with plugins
│   │   ├── commands/        # Tauri invoke handlers
│   │   │   ├── app.rs       # App commands (log, window, devtools)
│   │   │   ├── ballance.rs  # Ballance config reading/writing
│   │   │   ├── fs.rs        # File system operations
│   │   │   └── process.rs   # Process management
│   │   ├── ballance/        # Ballance-specific logic
│   │   │   ├── mod_config.rs    # Mod config parsing
│   │   │   ├── options.rs       # Database.tdb parsing
│   │   │   └── tdb/             # TDB file handling
│   │   └── common/           # Shared Rust code
│   │       ├── exception.rs     # Error types (RcResult, RcResultWith)
│   │       └── mod.rs
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Tauri configuration
│   └── resources/
│       └── builtin-mods/    # Built-in .bmodp modules
├── src-bmodp/               # C++ BMLPlus module
│   ├── src/
│   │   ├── RockoonIO.cpp/h     # Main I/O module
│   │   ├── MapLoader.cpp/h     # Map loading utilities
│   │   └── PathUtils.cpp/h      # Path utilities
│   ├── CMakeLists.txt          # CMake build config
│   ├── build.bat               # Windows build script
│   └── 3rd-party/              # Third-party SDKs
│       ├── Virtools-SDK-2.1/   # Virtools SDK
│       └── BMLPlus/            # BMLPlus SDK
├── public/                   # Static assets
├── index.html                # HTML entry point
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
├── package.json             # JS dependencies and scripts
└── .github/workflows/release.yml  # CI/CD for releases
```

## Code Conventions & Patterns

### Frontend (Vue/TypeScript)

#### Component Structure
- Use `<script setup lang="ts">` syntax
- Import from `@/` alias (mapped to `src/` directory)
- Components use "Basic" prefix for reusable UI elements (`BasicIcon`, `BasicButton`, etc.)

#### State Management (Pinia)
```typescript
// Store definition
export const useAppStore = defineStore("app", {
  state: (): AppStore => ({ ... }),
  getters: {
    // Computed properties
  },
  actions: {
    // Methods
    async changeSelect(path: string) { ... }
  }
});

// Hot module reloading support
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot));
}
```

#### Tauri Communication
All backend communication goes through `@/backend/index.ts`:
```typescript
import backend from "@/backend";

// Commands are organized by domain:
await backend.exists(path);
await backend.openInExplorer(path);
await backend.saveOptions(dbPath, options);
await backend.execute(cwd, bin);
```

#### Backend API Pattern
Commands in `src-tauri/src/commands/` use `#[command]` attribute:
```rust
#[command]
pub fn read_options(path: String) -> RcResultWith<BallanceOptions> {
    let mut options = BallanceOptions::new();
    options.read_from(&path)?;
    info!("Read options from {}", path);
    Ok(options)
}
```

Return types:
- `RcResult<()>` - Simple success/error
- `RcResultWith<T>` - Success with data

#### Router Configuration
- Uses `createMemoryHistory()` (not browser history) for desktop app
- Menu items in `routers/menu.ts` define both menu structure and routes
- Routes are auto-generated from menu structure

#### Internationalization (i18n)
```typescript
import { t } from "@/i18n";

// Use in templates
{{ t("key.path") }}

// Switch language
import { switchLanguage } from "@/i18n";
switchLanguage("en");
```

Language files in `src/i18n/languages/*.json`

#### Services Pattern
Services use `defineService` for singleton pattern:
```typescript
export const useDownloadService = defineService(() => {
  const getMapIndexes = withCache(
    () => getJson<BallanceMapsResponse>("download", "/map/index.json"),
    CACHE_EXPIRE_MS
  );
  return { getMapIndexes };
});
```

#### Utilities
- `withCache` - Caches async function results with expiration
- `withDebounce` - Debounces function calls
- `withDefault` - Merges objects with defaults
- `defineService` - Creates service singleton

### Backend (Rust)

#### Error Handling
Custom error types in `common/exception.rs`:
- `RcResult<T>` = `Result<T, Box<dyn Error>>`
- `RcResultWith<T>` = `Result<T, String>`

#### Logging
```rust
use log::{info, debug, warn, error};

// Initialized with env_logger in main()
env_logger::init();
```

Frontend logger forwards to Rust backend via `utils/logger.ts`

#### Command Organization
Commands are organized by domain:
- `app::` - Application-level commands (windows, devtools)
- `fs::` - File system operations
- `process::` - Process management
- `ballance::` - Ballance-specific operations

All commands must be registered in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    commands::app::log,
    commands::fs::open_in_explorer,
    // ... more commands
])
```

#### Tauri Plugins
Uses several Tauri plugins:
- `tauri-plugin-http` - HTTP requests
- `tauri-plugin-dialog` - File dialogs
- `tauri-plugin-shell` - Shell commands
- `tauri-plugin-positioner` - Window positioning
- `tauri-plugin-updater` - Auto-updates
- `tauri-plugin-single-instance` - Prevent multiple instances
- `tauri-plugin-upload` - File uploads

#### Serde Patterns
Serialization uses `#[serde(rename_all = "camelCase")]` for JS compatibility:
```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
    pub name: String,
    pub description: String,
}
```

### C++ Module (BMLPlus)

#### Build System
- Uses CMake for build configuration
- Outputs `.bmodp` extension (renamed DLL)
- Links against BMLPlus and Virtools SDK

#### Integration
- Built module is copied to `src-tauri/resources/builtin-mods/`
- Loaded by Ballance when BMLPlus is installed
- Used for advanced game integration features

### TypeScript Configuration

#### Strict Mode
TypeScript is configured with strict checking:
- `"strict": true`
- `"noUnusedLocals": true`
- `"noUnusedParameters": true`
- `"noFallthroughCasesInSwitch": true`

#### Path Aliases
```typescript
"@/*": ["./src/*"]
```

### Code Style

#### ESLint Rules
- Single quotes disabled (uses double quotes)
- Arrow function parens avoided
- No trailing commas
- Unused variables with `_` prefix are ignored
- `@typescript-eslint/no-explicit-any` is OFF
- Vue HTML elements always self-close

#### Prettier Config
```javascript
{
  bracketSpacing: true,
  singleQuote: false,           // Use double quotes
  arrowParens: "avoid",         // No parens for single arg
  trailingComma: "none"         // No trailing commas
}
```

#### Stylelint
- Uses standard SCSS config
- Order properties logically (variables, at-rules, declarations)
- Ignores `.js`, `.ts`, `.jsx`, `.tsx` files

#### Vue Style
- Use `<script setup lang="ts">`
- Use shorthand template syntax (`:prop`, `@event`)
- Components use PascalCase
- Props defined with TypeScript interfaces

### Key Architectural Patterns

#### Communication Flow
```
Vue Component → Store/Service → Backend Wrapper → Tauri Invoke → Rust Command
```

All Tauri calls go through backend wrappers for type safety and organization.

#### State Synchronization
- Pinia stores are persisted to local storage
- Store changes are debounced before saving
- Deep watching used for nested objects

#### File Handling
- All file operations go through Rust backend (security model)
- No direct Node.js file system access
- Windows-specific implementations use `explorer.exe` and `cmd`

#### Build Process
1. `build:ui` - Vite builds frontend (TypeScript check + build)
2. `build:bmodp` - CMake builds C++ module
3. Tauri integrates everything into desktop app

## Important Gotchas

### Development Environment
- Must use **pnpm** (not npm/yarn)
- Rust toolchain requires stable version
- Vite runs on port 1420 (strict port for Tauri)
- Tauri dev server ignores `src-tauri` directory for hot reload

### Platform Support
- **Currently Windows only** (see `.github/workflows/release.yml`)
- macOS and Linux builds are commented out in CI
- C++ module is Windows-specific (uses Win32)

### Tauri Specifics
- Uses memory-based router (not browser history)
- Window positioning via `tauri-plugin-positioner`
- Single instance enforcement prevents multiple app instances
- Webview versions: see Tauri 2.0 documentation

### File System
- All file operations must go through Rust backend (security model)
- No direct Node.js file system access
- Windows explorer integration for file opening

### Type Safety
- Rust uses `Box<dyn Error>` for errors
- Frontend has relaxed `@typescript-eslint/no-explicit-any` rule
- Type definitions in `types/` directory for shared interfaces

### Module Hot Reloading
- Pinia stores support HMR via `acceptHMRUpdate`
- Tauri hot reload requires restarting dev server for backend changes

### Logging
- Frontend console calls are forwarded to Rust backend
- Both frontend and backend use `log` crate
- Set `RUST_LOG` env var for debug logs (`RUST_LOG=info`)

### C++ Module
- Requires Virtools SDK (not included in repo)
- BMLPlus SDK also required
- Build outputs `.bmodp` extension (not `.dll`)

### Internationalization
- Language files loaded dynamically from `src/i18n/languages/`
- System language auto-detected
- Toggle language with Ctrl+T keyboard shortcut

### CSS/SCSS
- Naive UI components used for UI
- Custom CSS variables for theming
- SCSS for styling
- Mingcute icons for iconography

## Testing

No formal test suite is present in the codebase. Manual testing is performed during development.

## Release Process

Releases are automated via GitHub Actions:
1. Triggered on push to `release` branch
2. Builds for Windows only currently
3. Uses `tauri-apps/tauri-action` for packaging
4. Requires signing secrets (`TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD`)
5. Tag format: `rockoon-v__VERSION__`

## Dependencies Key Versions

- Node.js: v22.13.1
- pnpm: 9.15.4
- Rust: stable (cargo 1.84.0)
- Tauri: 2.x
- Vue: 3.5.17
- TypeScript: 5.6.3
- CMake: 4.0+
- C++ Standard: C++20

## Additional Resources

- [Tauri 2.0 Documentation](https://v2.tauri.app/)
- [Ballance Wiki](https://ballance.jxpxxzj.cn/)
- [BML (Ballance Mod Loader)](https://github.com/Gamepiaynmo/BallanceModLoader)
- [BMLPlus](https://github.com/doyaGu/BallanceModLoaderPlus)
- [Naive UI](https://www.naiveui.com/)
