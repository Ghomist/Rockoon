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

- **UI 结构（2026-10-26 改版后）**：主题色是天空蓝（styles.css 里 `--primary` 带色相 262，另有 `--success` / `--warning` token）。侧栏分组用 menu.ts 里的 `{ section }` 项（路由树忽略它），外链收进侧栏底部「社区与帮助」下拉。列表页统一走 `ListViewPage`（自动按路由取页面名 + 图标，`title` 只是副标题）+ `ResourceRow`/`RowAction`/`EmptyState`；带表单的页面用 `PageHeader` + `FormSection` 卡片。新页面照这套来，别再手写 header。
- **截图验证主窗口**：用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 pnpm tauri dev` 启动，再用 CDP（`http://127.0.0.1:9223/json` → `Runtime.evaluate` 点 `a[href="/maps"]` 切页、`Page.captureScreenshot` 截图）。Git Bash 里传 `/game` 这类参数要加 `MSYS_NO_PATHCONV=1`。别用屏幕坐标截图（CopyFromScreen 会截到挡在前面的别的窗口）。

- **主题色 / 背景**：styles.css 里所有颜色 token 都由 `--h`（色相）`--c`（主色彩度）`--nc`（中性色倾向）推出来，`[data-accent=x]` 预设只改这三个；`utils/theme.ts` 的 `ACCENTS` 是色板展示用的副本，两边要同步。`useAccent()` 主窗口和 TAS 窗口都要调。背景在 `components/AppBackground.tsx` + `components/backgrounds/`，一律用 `primary` 上色；canvas（粒子）拿不到 oklch，用 `usePrimaryRgb()` 转。

- **界面动效约定**（styles.css「界面动效」段）：切页 `.route-enter`（key=pathname 重挂载）；卡片 / 区块容器加 `.stagger`（直接子元素依次缩放淡入）；列表容器加 `.stagger-rows`（ListViewPage 已默认带上，行从左滑入）。transform 只能缩小 / 向左 / 向上——main 是 overflow-auto，往下或往外推会让滚动条闪；fill-mode 用 `backwards` 不用 `both`，否则动画结束后会压住子元素的 hover transform。侧栏选中底色是 `ActiveIndicator` 量 `[data-active="true"]` 的位置画一块滑过去，新加的侧栏项要带 `data-active`。明暗 / 主题色切换走 `useThemeEffect`（View Transition 整页交叉淡化，同一帧的多个改动并进一个过渡）。

## Do-Not-Repeat

- [2026-10-26] CDP 里 `import('/src/stores/pref.ts')` 拿到的可能不是 App 用的那份 store：HMR 改过的模块被 Vite 加了 `?t=` 时间戳，两份实例互不相通，结果「改了 pref 没反应」。要么重启 dev server，要么从 `performance.getEntriesByType('resource')` 里找 App 实际加载的 URL 再 import。

- [2026-10-26] 别在同一帧里起两个 `document.startViewTransition`：后一个会打断前一个，中间帧新旧颜色混在一起。用 `utils/theme.ts` 的 `runInTransition` 合并。读 `--primary` 之类主题变量时别假设 effect 里已经生效（View Transition 的回调是异步的），盯 `<html>` 的 MutationObserver。

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- (2026-10-13) MapLoader 是照 BML+ `BMLMod::LoadMap`（D:\Codes\BallanceModLoaderPlus\src\BMLMod.cpp）抄的；改它时要对照原版，原版还会写 DataShare `CustomMapName` 给 ObjectLoadHook 用。`pnpm build:bmodp` 在 cmake 不在 PATH 时会误报 success —— 用 VS 自带 cmake（Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin）。
