# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-07-12

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** rockoon
- **Description:** Rockoon 是一款集成了 **下载、管理、启动** 于一体的 Ballance 启动器。

- **TAS 竖版**：时间轴竖版靠 canvas 转置变换复用横版逻辑坐标（render.ts 的 uprightText 单独写字）；横竖切换给 TasTimeline 换 key 重挂载。
- **无侵入验证 TAS 界面**：用户常开着自己的 `pnpm tauri dev`（占 1420）。可用无头 Edge 打开 `http://127.0.0.1:1420/?window=tas`，注入假的 `__TAURI_INTERNALS__.invoke`（list / read_file）+ localStorage `rockoon-tas-editor.tasDirOverride` 来截图、派发 CDP 鼠标事件。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- (2026-10-13) MapLoader 是照 BML+ `BMLMod::LoadMap`（D:\Codes\BallanceModLoaderPlus\src\BMLMod.cpp）抄的；改它时要对照原版，原版还会写 DataShare `CustomMapName` 给 ObjectLoadHook 用。`pnpm build:bmodp` 在 cmake 不在 PATH 时会误报 success —— 用 VS 自带 cmake（Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin）。
