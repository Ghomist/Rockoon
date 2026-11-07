import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CircleArrowUp } from "lucide-react";
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
import {
  checkResourceUpdates,
  dismissResourceUpdates,
  type ResourceUpdate,
  unseenUpdates
} from "@/services/resourceUpdates";
import { useAppStore } from "@/stores/app";

/** `launch` = 照常启动；`update` = 不启动、去页面更新；`cancel` = 什么都不做 */
export type ResourceUpdateChoice = "launch" | "update" | "cancel";

interface Prompt {
  updates: ResourceUpdate[];
  /** 开游戏时多一个「继续启动」 */
  launching: boolean;
}

const useGuardStore = create<{ prompt: Prompt | null }>(() => ({
  prompt: null
}));
let settle: ((choice: ResourceUpdateChoice) => void) | null = null;
/** 对话框只挂在主窗口；TAS 编辑器窗口没有，那边启动游戏时不查 */
let mounted = false;

export const isResourceGuardMounted = () => mounted;

function ask(prompt: Prompt): Promise<ResourceUpdateChoice> {
  return new Promise(resolve => {
    // 上一次还开着就把它当「取消」，别把那个启动卡死
    settle?.("cancel");
    settle = resolve;
    useGuardStore.setState({ prompt });
  });
}

/** 启动游戏前提示有更新。用户选「继续启动」时同一版本不再提示 */
export const askResourceUpdatesBeforeLaunch = (updates: ResourceUpdate[]) =>
  ask({ updates, launching: true });

/** 列表里最多列这么多个，再多就只说总数 */
const MAX_LISTED = 8;

/**
 * 地图 / mod 有新版时的提示：打开启动器时查一次（每个会话一次），开游戏时由
 * `launchInstance` 调 `askResourceUpdatesBeforeLaunch`。只负责把人带到页面上，
 * 真正的更新在地图 / 模组页右上角的按钮里。
 */
export default function ResourceUpdateGuard() {
  const t = useT();
  const navigate = useNavigate();
  const instance = useAppStore(s => s.selectedInstanceData);
  const prompt = useGuardStore(s => s.prompt);
  const checked = useRef(false);

  useEffect(() => {
    mounted = true;
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!instance || checked.current) return;
    checked.current = true;
    void checkResourceUpdates(instance.path).then(updates => {
      const unseen = unseenUpdates(updates);
      if (unseen.length) void ask({ updates: unseen, launching: false });
    });
  }, [instance]);

  const close = (choice: ResourceUpdateChoice) => {
    const updates = useGuardStore.getState().prompt?.updates ?? [];
    const launching = useGuardStore.getState().prompt?.launching;
    useGuardStore.setState({ prompt: null });
    // 关掉启动时的提示 = 稍后；开游戏时点「取消」只是不开了，下次还要提醒
    if (choice === "launch" || (choice === "cancel" && !launching))
      dismissResourceUpdates(updates);
    const done = settle;
    settle = null;
    done?.(choice);
  };

  const updates = prompt?.updates ?? [];
  const goUpdate = () => {
    const hasMap = updates.some(u => u.kind === "map");
    close("update");
    navigate(hasMap ? "/maps" : "/mods");
  };

  return (
    <Dialog open={!!prompt} onOpenChange={open => !open && close("cancel")}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleArrowUp className="size-5 text-primary" />
            {t("resources.update.promptTitle")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t("resources.update.promptBody", { count: updates.length })}
        </p>

        <ul className="max-h-52 overflow-auto rounded-md border bg-muted/40 px-3 py-2 text-xs">
          {updates.slice(0, MAX_LISTED).map(u => (
            <li key={u.path} className="flex justify-between gap-3 py-0.5">
              <span className="truncate">
                {u.hub.package.name ?? u.hub.asset.name}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                v{u.hub.version} → v{u.hub.latest_version}
              </span>
            </li>
          ))}
          {updates.length > MAX_LISTED && (
            <li className="py-0.5 text-muted-foreground">
              {t("resources.update.andMore", {
                count: updates.length - MAX_LISTED
              })}
            </li>
          )}
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => close("cancel")}>
            {prompt?.launching
              ? t("common.dialog.cancel")
              : t("resources.update.later")}
          </Button>
          <div className="flex gap-2">
            {prompt?.launching && (
              <Button variant="outline" onClick={() => close("launch")}>
                {t("resources.update.launchAnyway")}
              </Button>
            )}
            <Button onClick={goUpdate}>{t("resources.update.goUpdate")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
