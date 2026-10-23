import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { create } from "zustand";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useT } from "@/i18n";

/** `launch` = 照常启动；`restore` = 不启动、去补丁页恢复；`cancel` = 什么都不做 */
export type VanillaGuardChoice = "launch" | "restore" | "cancel";

const useGuardStore = create<{ files: string[] | null }>(() => ({
  files: null
}));
let settle: ((choice: VanillaGuardChoice) => void) | null = null;
/** 对话框没挂上（TAS 编辑器窗口就没有）时不能弹窗，只能放行 */
let mounted = false;

/**
 * 启动前发现 `3D Entities` 里的原版文件被换过 / 丢了：问用户要不要照常启动。
 * 必须在主窗口（挂了 `VanillaGuard`）里调用；没有对话框时直接返回 `launch`。
 */
export function askVanillaModified(
  files: string[]
): Promise<VanillaGuardChoice> {
  if (!mounted) {
    // ponytail: TAS 编辑器窗口不带这个对话框，那里就跳过校验，别把启动卡住
    console.warn("Vanilla level guard is not mounted; skipping the check");
    return Promise.resolve("launch");
  }
  return new Promise(resolve => {
    // 上一次还开着就把它当「取消」，别把那个启动卡死
    settle?.("cancel");
    settle = resolve;
    useGuardStore.setState({ files });
  });
}

/**
 * 「原版素材被改过」的启动提醒。挂在主窗口里（要有 router，好跳到补丁页）；
 * 用户选了什么都不启动 —— 启动本身由 `launchInstance` 拿返回值决定。
 */
export default function VanillaGuard() {
  const t = useT();
  const navigate = useNavigate();
  const files = useGuardStore(s => s.files);

  useEffect(() => {
    mounted = true;
    return () => {
      mounted = false;
    };
  }, []);

  const close = (choice: VanillaGuardChoice) => {
    useGuardStore.setState({ files: null });
    const done = settle;
    settle = null;
    done?.(choice);
  };

  return (
    <Dialog open={!!files} onOpenChange={open => !open && close("cancel")}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-amber-500" />
            {t("vanilla.warnTitle")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t("vanilla.warnBody", { count: files?.length ?? 0 })}
        </p>

        <ul className="max-h-52 overflow-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
          {(files ?? []).map(file => (
            <li key={file} className="truncate">
              {file}
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => close("cancel")}>
            {t("common.dialog.cancel")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => close("launch")}>
              {t("vanilla.warnLaunch")}
            </Button>
            <Button
              onClick={() => {
                close("restore");
                navigate("/patches");
              }}
            >
              {t("vanilla.warnRestore")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
