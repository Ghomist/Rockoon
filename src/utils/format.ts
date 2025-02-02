/** value 不足 len 长度时自动在前面补 pad */
export const pad = (value: number, pad: string, len: number) =>
  (Array(len).join(pad) + value).slice(-len);

/** 格式化模组名 */
export const formatModName = (modName: string) => {
  if (modName.endsWith(".disable")) {
    modName = modName.replace(".disable", "");
  }
  return modName.substring(0, modName.lastIndexOf("."));
};
