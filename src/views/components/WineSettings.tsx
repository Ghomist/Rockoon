import { useCallback, useEffect, useState } from "react";
import { open as browse } from "@tauri-apps/plugin-dialog";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

import backend from "@/backend";
import { useT } from "@/i18n";
import { installRosetta, installWineAsTask } from "@/services/wine";
import { useDownloadsStore } from "@/stores/downloads";
import { dialog, message } from "@/utils/ui/feedback";
import NFormWrapper, {
  type Schema,
  type SchemaItem
} from "@/views/components/NFormWrapper";

/** 设置页的「Wine 运行环境」一节（只在 macOS 上显示，见 Settings） */
export default function WineSettings() {
  const t = useT();
  const [status, setStatus] = useState<WineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  // Wine 安装任务结束时重新读一次状态
  const installing = useDownloadsStore(s =>
    s.tasks.some(task => task.kind === "wine" && task.status === "running")
  );

  const refresh = useCallback(async () => {
    try {
      setStatus(await backend.wine.status());
    } catch (e) {
      console.warn("Wine status failed:", e);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, installing]);

  /** 跑一个会返回新状态的后端操作：期间禁止重复点击，失败弹错误 */
  const run = async (
    action: () => Promise<WineStatus | undefined>,
    done?: string
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await action();
      if (next) setStatus(next);
      else await refresh();
      if (done) message.success(done);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickCustom = async () => {
    // .app 在文件选择框里是「文件」；也可以直接选 bin/wine
    const picked = await browse({
      multiple: false,
      directory: false,
      title: t("wine.pickCustom")
    });
    if (typeof picked !== "string") return;
    await run(() => backend.wine.setCustom(picked), t("wine.customSet"));
  };

  const onResetPrefix = () => {
    dialog.warning({
      title: t("wine.resetPrefix"),
      content: t("wine.resetPrefixConfirm"),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => {
        void run(() => backend.wine.resetPrefix(), t("wine.resetPrefixDone"));
      }
    });
  };

  const schema: (Schema & SchemaItem)[] = [
    ...(status && !status.rosetta
      ? ([
          {
            type: "button",
            label: t("wine.rosettaInstall"),
            tip: t("wine.rosettaContent"),
            onClick: () =>
              void run(async () => (await installRosetta(), undefined))
          }
        ] as (Schema & SchemaItem)[])
      : []),
    ...(status?.bundledVersion
      ? ([
          {
            type: "button",
            label:
              status.source === "builtin"
                ? t("wine.reinstall")
                : t("wine.install"),
            tip: t("wine.reinstallTip", { version: status.bundledVersion }),
            onClick: () => void installWineAsTask(true)
          }
        ] as (Schema & SchemaItem)[])
      : []),
    {
      type: "button",
      label: t("wine.useCustom"),
      tip: t("wine.useCustomTip"),
      onClick: () => void onPickCustom()
    },
    ...(status?.customPath
      ? ([
          {
            type: "button",
            label: t("wine.useDefault"),
            onClick: () =>
              void run(
                () => backend.wine.setCustom(null),
                t("wine.customCleared")
              )
          }
        ] as (Schema & SchemaItem)[])
      : []),
    {
      type: "button",
      label: t("wine.resetPrefix"),
      tip: t("wine.resetPrefixTip"),
      onClick: onResetPrefix
    },
    {
      type: "button",
      label: t("wine.openConfig"),
      tip: t("wine.openConfigTip"),
      onClick: () =>
        void run(async () => (await backend.wine.openConfig(), undefined))
    }
  ];

  const ok = status?.installed && status.rosetta;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <p className="flex items-center gap-1.5">
          {!status || busy || installing ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : ok ? (
            <CircleCheck className="size-4 text-emerald-500" />
          ) : (
            <CircleAlert className="size-4 text-amber-500" />
          )}
          {!status
            ? t("wine.checking")
            : !status.rosetta
              ? t("wine.rosettaTitle")
              : status.installed
                ? t("wine.statusInstalled", {
                    version: status.version ?? "?",
                    source: t(`wine.source.${status.source ?? "builtin"}`)
                  })
                : status.customPath
                  ? t("wine.customMissing", { path: status.customPath })
                  : status.bundledVersion
                    ? t("wine.statusPending", {
                        version: status.bundledVersion
                      })
                    : t("wine.notBundled")}
        </p>
        {status?.installed && (
          <p className="break-all text-xs text-muted-foreground">
            {status.path}
            {" · "}
            {status.prefixReady
              ? t("wine.prefixReady")
              : t("wine.prefixPending")}
          </p>
        )}
      </div>
      <NFormWrapper schema={schema} />
    </>
  );
}
