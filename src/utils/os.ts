export type PathSeparator = "/" | "\\";

// TODO: Implement OS detection
// export const getOs = (): "win" | "mac" | "linux" =>
//   process.platform === "win32"
//     ? "win"
//     : process.platform === "darwin"
//       ? "mac"
//       : "linux";

export const getPathSeparator = (): PathSeparator => {
  return "\\";
};
