/** value 不足 len 长度时自动在前面补 pad */
export const pad = (value: number, pad: string, len: number) =>
  (Array(len).join(pad) + value).slice(-len);

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

/** 格式化文件后缀 */
export const formatFileType = (fileName: string) => {
  if (fileName.endsWith(".disable")) {
    fileName = fileName.replace(".disable", "");
  }
  return fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase();
};
