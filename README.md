# Rockoon

Rockoon 是一款集成了 **下载、管理、启动** 于一体的 Ballance 启动器。

本启动器借助 [Tauri 2.0](https://v2.tauri.app/) 开发，需要 webview 才能正常运行与显示。最低支持的系统以及 webview 版本参见[官方文档](https://v2.tauri.app/reference/webview-versions/)。

## 功能

- 启动 Ballance（支持一键启动指定地图）
- 管理 Ballance 实例
  - 外部更改游戏设置
  - 解锁原版关卡
  - 修改、重置排行榜
  - 预览、修改天空盒（自定义背景）；安装天空盒包时会问「装到哪一关」（包内 `Sky_X_*` 的 X 是占位符，安装时替换成那一关的字母）
  - BML/BMLPlus 支持
    - 管理自制地图
    - 管理 Mod（禁用 Mod）
    - 更改 Mod 设置
  - 新 Player 支持
    - 修改启动参数
- 资源管理
  - 本地地图、Mod、天空盒浏览与管理
- 资源中心（Resource Hub）
  - 搜索、下载社区地图和 Mod
  - 上传地图、管理预览图
  - 批量上传（模板导入）
  - 作者管理与别名系统
- 多实例管理（游玩时间统计）
- 支持中文/英文双语切换

如有功能需求，欢迎提交 issue，或前往 Ballance 中文社区进一步交流。

## 开发

依赖：

- Rust (stable)
- Node.js v22+
- pnpm 9+

安装依赖并以调试模式启动：

```shell
pnpm install
pnpm tauri dev
```

也支持仅启动 vite（前端调试）：

```shell
pnpm dev
```

构建：

```shell
pnpm build        # 构建完整应用（UI + C++ 模块）
pnpm build:ui     # 仅构建前端
pnpm build:bmodp  # 仅构建 C++ BMLPlus 模块
```

代码检查：

```shell
pnpm lint  # 运行 eslint + prettier + stylelint
```

## macOS（实验性）

macOS 上游戏通过 [Wine](https://www.winehq.org/) 运行（Apple 芯片需要 Rosetta 2）：

- 首次启动游戏时会提示下载 Wine 运行环境（[ballance-mac-bundle](https://github.com/CHHC-L/ballance-mac-bundle) 发布的精简包，约 80 MB，下不了再换 [Gcenx 的原版构建](https://github.com/Gcenx/macOS_Wine_builds)；装在启动器自己的数据目录里）；本机有 [Ballance.app](https://github.com/CHHC-L/ballance-mac-bundle/releases/latest)（Mac 完整安装包）时直接用它自带的 Wine 和前缀，不用另外下载。
- 安装原版游戏、补丁、下载站资源与 Windows 版一致；设置页多了「Wine 运行环境」一节（重新安装 / 本地压缩包安装 / 指定已有 Wine / 重建前缀）。
- 启动游戏经过一个小启动器 `BallanceLauncher.exe`（`src-launcher/`）：Apple 芯片上 Rosetta 2 偶尔让 Player 初始化 Direct3D 失败，启动器会等到游戏窗口出来，没起来就自动重试。
- 自动修补原版输入管理器（`Managers/Dx5InputManager.dll`）的按键重复 bug：开机超过 24.8 天后输入名字会一个键出一串字，Mac 很少重启所以几乎必现（只改原版文件，留 `.orig` 备份）。
- 暂不支持：TAS 编辑器、启动器自动更新。

构建（额外需要 `brew install sevenzip`，用来从 Windows 安装包里取出预编译的 RockoonIO 模组；改了 `src-launcher/launch.c` 的话用 `pnpm build:launcher` 重新编译，需要 [zig](https://ziglang.org/download/)）：

```shell
pnpm install
CI=true pnpm tauri build   # 产物在 src-tauri/target/release/bundle/{macos,dmg}
```

## 技术栈

- **前端**: Vue 3 + TypeScript + Naive UI + Pinia + Vue I18n + Vue Router
- **后端**: Tauri 2.0 (Rust)
- **原生模块**: C++ (BMLPlus plugin, CMake 构建)

## 引用与鸣谢

Rockoon 是致力于做到 Ballance 社区 All-in-One 的项目，而这注定是一个多方参与、贡献才能达成的目标。下面列出了部分参与其中的项目，感谢这些项目以及它们背后的贡献者，有了你们，才有了更好的 Ballance 社区，才有了更好的 Rockoon：

- [Ballance Wiki](https://ballance.jxpxxzj.cn/)
- [Ballance 地图下载站](http://ballancemaps.ysepan.com/)
- [BML (Ballance Mod Loader)](https://github.com/Gamepiaynmo/BallanceModLoader)
- [BMLPlus (Ballance Mod Loader Plus)](https://github.com/doyaGu/BallanceModLoaderPlus)
- [New Player](https://github.com/doyaGu/BallancePlayer)
- 感谢由 [Chris](https://github.com/chirs241097/)、[61](https://github.com/ShadowPower)、[yyc](https://github.com/yyc12345) 提供的 MenuLevel 动态渲染图（名称为圈内常用缩写称呼）
