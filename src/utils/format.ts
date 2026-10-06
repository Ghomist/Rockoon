/** value 不足 len 长度时自动在前面补 pad */
export const pad = (value: number, pad: string, len: number) =>
  (Array(len).join(pad) + value).slice(-len);

export const toPercentage = (value: number) => (value * 100).toFixed(2) + "%";

/** value 超出 len 长度时自动在后面加上省略号 */
export const clampString = (str: string, len: number) =>
  str.length > len ? str.slice(0, len) + "..." : str;

/** 格式化文件名 */
export const formatFileName = (fileName: string) => {
  if (fileName.endsWith(".disable")) {
    fileName = fileName.replace(".disable", "");
  }
  return fileName.substring(0, fileName.lastIndexOf("."));
};

/** 格式化文件大小 */
export const formatFileSize = (b: number) => {
  if (b < 1024) return "<1KB";
  const kb = Math.floor(b / 1024);
  if (kb < 1024) return kb + "KB";
  const mb = Math.floor(kb / 1024);
  if (mb >= 1024) return ">1GB";
  return mb + "MB";
};

/** 下载进度 / 速度用：保留一位小数，小文件也能看出变化 */
export const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** 格式化文件后缀 */
export const formatFileType = (fileName: string) => {
  if (fileName.endsWith(".disable")) {
    fileName = fileName.replace(".disable", "");
  }
  return fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase();
};

export const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${pad(hours, "0", 2)}:${pad(minutes % 60, "0", 2)}:${pad(
    seconds % 60,
    "0",
    2
  )}`;
};

/** 格式化游玩时间（秒转小时+分钟+秒） */
export const formatPlaytime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours === 0 && mins === 0) return `${secs}s`;
  if (hours === 0) return `${mins}m ${secs}s`;
  if (mins === 0) return `${hours}h ${secs}s`;
  return `${hours}h ${mins}m ${secs}s`;
};
