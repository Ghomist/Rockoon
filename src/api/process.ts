import { invoke } from "@tauri-apps/api/core";

export default {
  execute: (cwd: string, bin: string) =>
    invoke<number>("execute", { cwd, bin }),
  kill: (pid: number) => invoke("kill", { pid }),
  check: (pid: number) => invoke("check", { pid })
};
