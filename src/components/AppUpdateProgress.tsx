import { useT } from "@/i18n";
import ImportProgressDialog from "@/components/ImportProgressDialog";
import { useUpdateProgress } from "@/services/updater";

/**
 * 启动器自更新的进度弹窗（常驻在 App 里，见 services/updater）。
 *
 * 不给 `onCancel` ⇒ 弹窗锁死后没有取消按钮：tauri 的更新插件没有取消接口，
 * 下载中断不了，与其给个点不动的按钮不如不给。
 */
export default function AppUpdateProgress() {
  const t = useT();
  const { open, phase, percent, downloaded, total, error, close } =
    useUpdateProgress();

  return (
    <ImportProgressDialog
      open={open}
      phase={phase}
      percent={percent}
      downloaded={downloaded}
      total={total}
      error={error}
      resultText={t("updater.installed")}
      labels={{
        connecting: t("updater.downloading"),
        downloading: t("updater.downloading"),
        importing: t("updater.installing"),
        done: t("updater.installed")
      }}
      onClose={close}
    />
  );
}
