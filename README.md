# Rockoon

Rockoon 是一款集成了 **下载、管理、启动** 于一体的 Ballance 启动器。

本启动器借助 [Tauri 2.0](https://v2.tauri.app/) 开发，需要 webview 才能正常运行与显示。最低支持的系统以及 webview 版本参见[官方文档](https://v2.tauri.app/reference/webview-versions/)。

## 功能

- 启动 Ballance（支持一键启动指定地图）
- 管理 Ballance 实例
  - 外部更改游戏设置
  - 解锁原版关卡
  - 修改、重置排行榜
  - 预览、修改天空盒（自定义背景）
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
