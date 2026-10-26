import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import PatchOptionsDialog from "@/components/PatchOptionsDialog";
import { useVanillaInstall } from "@/services/game";
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
  const profilesLoad = useProfilesStore(s => s.load);

  const [picking, setPicking] = useState(false);
  // 原版游戏安装：没有游戏时也能一键下好（否则新用户得先自己去搞一份游戏才能用）
  const {
    start: installGame,
    busy: installing,
    optionsDialog
  } = useVanillaInstall();

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
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
      />
      <div className="relative w-full max-w-[460px] rounded-2xl border bg-card/90 p-8 text-card-foreground shadow-xl shadow-primary/5 backdrop-blur">
        <div className="flex flex-col items-center gap-6">
          <span className="flex size-20 items-center justify-center rounded-2xl border bg-background shadow-sm">
            <img
              src="/logo.png"
              alt="Rockoon"
              className="size-14 dark:invert"
              draggable={false}
            />
          </span>

          <div className="flex flex-col items-center gap-2">
            <h1 className="m-0 text-[22px] font-semibold tracking-tight">
              {t("onboarding.title")}
            </h1>
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {t("onboarding.desc")}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2">
            <Button
              size="lg"
              disabled={picking || installing}
              onClick={onPickFolder}
              className="w-full"
            >
              {picking ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              {t("onboarding.pick")}
            </Button>

            <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("onboarding.or")}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              disabled={picking || installing}
              onClick={() => void installGame()}
              className="w-full"
            >
              {installing ? <Loader2 className="animate-spin" /> : <Download />}
              {t("game.install")}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground/80">
            {t("onboarding.hint")}
          </p>
        </div>
      </div>

      <PatchOptionsDialog {...optionsDialog} busy={installing} />
    </div>
  );
}
