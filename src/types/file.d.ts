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
  uploadTime: string;
};
/** 永硕云盘缓存 */
type YsCache = {
  lastUpdate?: Date;
  folders: YsFolder[];
  files: { [id: string]: YsFile[] };
};
