/** value 不足 len 长度时自动在前面补 pad */
export const pad = (value: number, pad: string, len: number) =>
  (Array(len).join(pad) + value).slice(-len);

/** 格式化模组名 */
export const formatFileName = (fileName: string) => {
  if (fileName.endsWith(".disable")) {
    fileName = fileName.replace(".disable", "");
  }
  return fileName.substring(0, fileName.lastIndexOf("."));
};

export const formatFileType = (fileName: string) => {
  if (fileName.endsWith(".disable")) {
    fileName = fileName.replace(".disable", "");
  }
  return fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase();
};
