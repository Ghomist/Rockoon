/** 制图工具（Blender + BBP），见 src-tauri/src/commands/blender.rs */

type BbpModule = {
  /** `bl_ext.user_default.bbp_ng` = 4.0+ 扩展；其他 = 旧版插件 */
  module: string;
  version: string;
  enabled: boolean;
  /** BBP 偏好里的 External Texture Folder */
  textureFolder: string;
  /** 插件目录 */
  path: string;
};

type BlenderProbe = {
  version: string;
  /** user_default 扩展仓库目录（Blender 4.2 以前没有扩展系统，是空串） */
  extensionsDir: string;
  bbp: BbpModule[];
};

type BbpRelease = {
  tag: string;
  assetName: string;
  url: string;
  size: number;
};
