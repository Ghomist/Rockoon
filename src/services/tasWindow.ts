import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** 编辑器窗口的 label（capability 里也要写上这个 label，否则新窗口用不了 IPC）。 */
export const TAS_WINDOW_LABEL = "tas-editor";

let creating: Promise<void> | null = null;

/**
 * 打开 TAS 编辑器窗口（独立窗口，不切换主窗口当前页面）。
 * 已经开着就把它提出来——与「一键安装」那套「把窗口提到最前」的做法一致。
 */
export async function openTasEditorWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TAS_WINDOW_LABEL);
  if (existing) {
    await existing.unminimize().catch(() => undefined);
    await existing.show().catch(() => undefined);
    // 编辑器一进来就铺满：和下面新建时的 maximized 保持一致
    await existing.maximize().catch(() => undefined);
    await existing.setFocus().catch(() => undefined);
    return;
  }

  // 连点两下菜单别开出两个窗口
  if (creating) return creating;
  creating = (async () => {
    const win = new WebviewWindow(TAS_WINDOW_LABEL, {
      // 走同一个 index.html，用查询参数区分要渲染哪个入口（应用用的是 MemoryRouter，
      // 路径不体现在 URL 上，所以这里用 ?window=tas 而不是路由）
      url: "index.html?window=tas",
      title: "TAS Editor",
      // 上左（文件列表 + 编辑面板）+ 上右（游戏区域，按分辨率 1:1 画）+ 下（时间轴）都要放得下：
      // width/height 是「取消最大化后」的尺寸（默认 1024×768 分辨率需要 536 + 1024 宽、824 + 时间轴 高）
      width: 1580,
      height: 1060,
      minWidth: 1100,
      minHeight: 720,
      resizable: true,
      decorations: false,
      // 编辑器一打开就铺满屏幕工作区（剪辑软件那种用法），用户后续可以自己取消最大化
      maximized: true,
      center: true
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://created", () => resolve());
      win.once("tauri://error", e => reject(new Error(String(e.payload))));
    });
  })();

  try {
    await creating;
  } finally {
    creating = null;
  }
}
