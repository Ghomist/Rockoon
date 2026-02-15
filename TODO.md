# TODO

## Uncompleted

<!-- 如果没有未完成的任务，可以填写“已全部完成” -->

## Completed (2026-02-15)

- ✅ 地图下载时没有进度条，可参考实例扫描时的进度条实现
  - 已在 Download.vue 中添加 loadingBar.start() 和 loadingBar.finish()
  - 下载过程中显示进度条
  - 错误时显示 loadingBar.error()

- ✅ 地图下载时无法跳转到其它页面，点击其它页面的标签会卡死，需要实现后台下载（使用 download service）
  - 扩展了 useDownloadService (services/download.ts) 添加 downloadMap 方法
  - 使用 Tauri HTTP 插件的 fetch API 实现带进度追踪的下载
  - 下载任务在 service 内部管理，支持页面切换后继续下载

- ✅ 下载模态框功能增强
  - 添加 :closable="false" 隐藏关闭按钮（X）
  - 添加 :mask-closable="false" 和 :close-on-esc="false" 阻止用户关闭
  - 下载完成后显示勾图标（check-circle-fill）
  - 失败时显示叉图标（close-circle-fill）

- ✅ 下载进度显示
  - 使用 HEAD 请求获取文件大小
  - 使用 ReadableStream 追踪下载进度
  - 模态框中显示 Naive UI 进度条（n-progress）
  - 显示下载百分比数字（0-100%）
  - 后端添加 write_file 命令保存 base64 编码的文件数据

- ✅ 优化下载体验
  - 移除下载开始时的 loading 消息（已有模态框，不需要重复提示）
  - 下载进度为 0% 时显示"准备中..."状态
  - 下载完成后延迟 1.5 秒关闭模态框，确保用户看到成功提示
  - 下载失败后延迟 3 秒关闭模态框，确保用户看到错误提示
  - 修复 base64 栈溢出问题（使用分块处理）
  - 修复 base64 padding 问题（分块转字符，整体编码）
