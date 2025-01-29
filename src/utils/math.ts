export const convertFileSize = (b: number) => {
  if (b < 1024) return "<1KB";
  const kb = Math.floor(b / 1024);
  if (kb < 1024) return kb + "KB";
  const mb = Math.floor(kb / 1024);
  if (mb >= 1024) return ">1GB";
  return mb + "MB";
};

export const mapRange = (
  x: number,
  l1: number,
  r1: number,
  l2: number,
  r2: number
) => {
  const p = (x - l1) / (r1 - l1);
  return l2 + (r2 - l2) * p;
};
