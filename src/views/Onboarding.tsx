import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Rocket, FolderOpen, Loader2 } from "lucide-react";
import { useT } from "@/i18n";
import { useAppStore } from "@/stores/app";
import { usePrefStore } from "@/stores/pref";
import { useProfilesStore } from "@/stores/profiles";
import { message } from "@/utils/ui/feedback";
import { open as browseDir } from "@tauri-apps/plugin-dialog";

/** Initial instance picker shown when no Ballance install is configured. */
export default function Onboarding() {
  const t = useT();
  const navigate = useNavigate();
  const loadInstance = useAppStore(s => s.loadInstance);
  const darkMode = usePrefStore(s => s.theme === "dark");
  const profilesLoad = useProfilesStore(s => s.load);

  const [picking, setPicking] = useState(false);

  const onPickFolder = async () => {
    setPicking(true);
    try {
      const folder = await browseDir({
        directory: true,
        title: t("onboarding.browse.title")
      });
      if (!folder) return;

      const ok = await loadInstance(folder);
      if (!ok) {
        message.error(t("onboarding.invalid"));
        return;
      }
      usePrefStore.setState({ instancePath: folder });
      await profilesLoad();
      message.success(t("onboarding.success"));
      navigate(usePrefStore.getState().route || "/game");
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[520px] rounded-2xl border bg-card p-8 text-card-foreground shadow-sm">
        <div className="flex flex-col items-center gap-5">
          <Rocket
            size={72}
            className={darkMode ? "text-foreground" : "text-emerald-500"}
          />

          <div className="flex flex-col items-center gap-1.5">
            <h1 className="m-0 text-[22px] font-semibold">
              {t("onboarding.title")}
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              {t("onboarding.desc")}
            </p>
          </div>

          <button
            type="button"
            disabled={picking}
            onClick={onPickFolder}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {picking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderOpen className="size-4" />
            )}
            {t("onboarding.pick")}
          </button>

          <p className="text-center text-xs text-muted-foreground/80">
            {t("onboarding.hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
