/** 由启动器管理的文件类型/数据 */
type ManagedFile = {
  name: string;
  size: number;
};

/** 永硕云盘目录 */
type YsFolder = {
  id: string;
  name: string;
  notes: string;
};
/** 永硕云盘文件 */
type YsFile = {
  category: string;
  filename: string;
  url: string;
  size: string;
  notes: string;
  uploadTime: Date;
};
/** 永硕云盘缓存 */
type YsCache = {
  /** 最近更新时间 */
  lastUpdate?: Date;

  /** 网盘元信息 */
  meta: { [key: string]: any };

  /** 目录列表 */
  folders: YsFolder[];

  /** 文件列表 */
  files: { [id: string]: YsFile[] };
};
