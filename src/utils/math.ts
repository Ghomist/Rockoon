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
