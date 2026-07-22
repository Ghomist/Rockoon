import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open as browseDir } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { checkForUpdate } from "@/services/updater";
import { useT } from "@/i18n";
import { dialog, message } from "@/utils/ui/feedback";
import storage from "@/utils/storage";
import NFormWrapper, {
  type Field,
  type Schema,
  type SchemaItem
} from "@/views/components/NFormWrapper";

// Subscribe to all pref fields touched here so NFormWrapper's controlled
// inputs (which read via field.get()) re-render after field.set().
function usePrefFields() {
  return {
    instancePath: usePrefStore(s => s.instancePath),
    language: usePrefStore(s => s.language),
    theme: usePrefStore(s => s.theme),
    backgroundType: usePrefStore(s => s.backgroundType),
    centerWindow: usePrefStore(s => s.centerWindow),
    hideWinWhenLaunch: usePrefStore(s => s.hideWinWhenLaunch),
    showWelcome: usePrefStore(s => s.showWelcome),
    mapOnlyMode: usePrefStore(s => s.mapOnlyMode),
    ingameMotd: usePrefStore(s => s.ingameMotd),
    ingameMotdContent: usePrefStore(s => s.ingameMotdContent)
  };
}

type PrefFields = ReturnType<typeof usePrefFields>;

const prefField = <K extends keyof PrefFields>(
  pref: PrefFields,
  key: K
): Field => ({
  get: () => pref[key],
  set: v => usePrefStore.setState({ [key]: v } as any)
});

export default function Settings() {
  const t = useT();
  const pref = usePrefFields();
  const app = useAppStore();
  const profiles = useProfilesStore();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  const onCheckUpdate = async () => {
    const msg = message.loading(t("settings.checkingUpdate"), { duration: 0 });
    await checkForUpdate();
    msg.destroy();
  };

  const onReload = () => location.reload();

  const onChangeInstancePath = async () => {
    const folder = await browseDir({
      directory: true,
      title: t("onboarding.browse.title")
    });
    if (!folder) return;
    const ok = await app.loadInstance(folder);
    if (!ok) {
      message.error(t("onboarding.invalid"));
      return;
    }
    usePrefStore.setState({ instancePath: folder });
    await profiles.load();
    message.success(t("settings.instance.changed"));
  };

  const instanceSchema: (Schema & SchemaItem)[] = [
    {
      type: "button",
      label: t("settings.instance.change"),
      onClick: onChangeInstancePath
    }
  ];

  const basicSchema: (Schema & SchemaItem)[] = [
    {
      type: "select",
      label: "语言 / Language",
      field: prefField(pref, "language"),
      options: [
        { value: "en", label: "English" },
        { value: "zh", label: "简体中文" }
      ]
    },
    {
      type: "select",
      label: t("settings.theme.title"),
      field: prefField(pref, "theme"),
      options: [
        { value: "auto", label: t("settings.theme.auto") },
        { value: "light", label: t("settings.theme.light") },
        { value: "dark", label: t("settings.theme.dark") }
      ]
    },
    {
      type: "select",
      label: t("settings.background.title"),
      field: prefField(pref, "backgroundType"),
      options: [
        { value: "grid", label: t("settings.background.grid") },
        { value: "particles", label: t("settings.background.particles") },
        { value: "meteors", label: t("settings.background.meteors") },
        { value: "hexagon", label: t("settings.background.hexagon") }
      ]
    },
    {
      type: "switch",
      label: t("settings.centerWindow"),
      field: prefField(pref, "centerWindow")
    },
    {
      type: "switch",
      label: t("settings.hideWinWhenLaunch"),
      field: prefField(pref, "hideWinWhenLaunch")
    },
    {
      type: "switch",
      label: t("settings.showWelcome"),
      field: prefField(pref, "showWelcome")
    }
  ];

  const ingameSchema: (Schema & SchemaItem)[] = [
    {
      type: "switch",
      label: t("settings.mapOnlyMode"),
      tip: t("settings.mapOnlyModeTip"),
      field: prefField(pref, "mapOnlyMode")
    },
    {
      type: "switch",
      label: t("settings.ingameMotd"),
      field: prefField(pref, "ingameMotd")
    },
    {
      type: "input",
      label: t("settings.ingameMotdContent"),
      field: prefField(pref, "ingameMotdContent")
    }
  ];

  const debugSchema: (Schema & SchemaItem)[] = [
    {
      type: "button",
      label: t("settings.checkUpdate"),
      tip: t("settings.update") + appVersion,
      onClick: onCheckUpdate
    },
    {
      type: "button",
      label: t("common.action.openDevtools"),
      onClick: () => backend.openDevtools()
    },
    {
      type: "button",
      label: t("settings.clearStorage.button"),
      onClick: () => {
        dialog.error({
          title: t("common.message.warning"),
          content: t("settings.clearStorage.title"),
          positiveText: t("common.dialog.confirm"),
          negativeText: t("common.dialog.cancel"),
          onPositiveClick: () => {
            storage.clear();
            onReload();
          }
        });
      }
    }
  ];

  return (
    <div className="flex flex-col gap-6 p-7">
      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.instance.title")}
        </h2>
        <p className="text-sm text-muted-foreground break-all">
          {pref.instancePath || t("common.none")}
        </p>
        <NFormWrapper schema={instanceSchema} />
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.basic")}
        </h2>
        <NFormWrapper schema={basicSchema} />
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.ingame")}
        </h2>
        <NFormWrapper schema={ingameSchema} />
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.debug")}
        </h2>
        <NFormWrapper schema={debugSchema} />
      </section>
    </div>
  );
}
