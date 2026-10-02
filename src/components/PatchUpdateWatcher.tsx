import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { dialog } from "@/utils/ui/feedback";
import { checkPatchUpdates, dismissPatchUpdate } from "@/services/patches";

/**
 * 启动时检查「已经装过的补丁」有没有更新，有就弹一次窗问要不要去补丁页更新。
 *
 * 只提示装过的补丁（没装过的不打扰，安装入口在补丁页）；用户点「稍后」会记住
 * 这个版本号，同一版本不再重复提示。每个会话只查一次。
 */
export default function PatchUpdateWatcher() {
  const t = useT();
  const navigate = useNavigate();
  const instance = useAppStore(s => s.selectedInstanceData);
  const checked = useRef(false);

  useEffect(() => {
    if (!instance || checked.current) return;
    checked.current = true;

    void (async () => {
      try {
        const updates = await checkPatchUpdates(instance.path);
        if (!updates.length) return;
        const body = updates
          .map(u => `· ${u.component.name}：${u.installed || "?"} → ${u.component.latest}`)
          .join("\n");
        dialog.info({
          title: t("patches.updateTitle"),
          content: `${t("patches.updateBody")}\n${body}\n\n${t("patches.updateHint")}`,
          positiveText: t("patches.updateNow"),
          negativeText: t("patches.later"),
          onPositiveClick: () => {
            navigate("/patches");
          },
          onClose: () => {
            // 点了「稍后」就记住这个版本，下次不再为它弹窗
            updates.forEach(u => dismissPatchUpdate(u.component));
          }
        });
      } catch (e) {
        console.warn("Patch update check failed:", e);
      }
    })();
  }, [instance, navigate, t]);

  return null;
}
