import { useEffect, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import {
  Monitor,
  Volume2,
  Gamepad2,
  BookOpen,
  Wrench,
  Image as ImageIcon,
  TriangleAlert,
  Bug,
  FileText
} from "lucide-react";
import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { dialog } from "@/utils/ui/feedback";
import NFormWrapper, {
  type Field,
  type Schema,
  type SchemaItem
} from "@/views/components/NFormWrapper";
import FormSection from "@/views/components/FormSection";
import SettingsNav, { type NavItem } from "@/views/components/SettingsNav";
import VirtualKeyboard from "@/views/components/VirtualKeyboard";
import { getKeyName } from "@/views/components/key";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

// Mutates options in place + replaces options ref so the store subscription
// (stores/index.ts deep-watches selectedInstanceData.options) persists to tdb.
const mutateOptions = (mutator: (opts: BallanceOptions) => void): void => {
  const cur = useAppStore.getState().selectedInstanceData;
  if (!cur) return;
  mutator(cur.options);
  useAppStore.setState({
    selectedInstanceData: { ...cur, options: { ...cur.options } }
  });
};

export default function GameConfig() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const [launchConfig, setLaunchConfig] = useState<BallanceLaunchConfig>();
  const [launchConfigPath, setLaunchConfigPath] = useState("");

  // Persist on any change.
  useEffect(() => {
    if (!launchConfig || !launchConfigPath) return;
    void backend.saveLaunchConfig(launchConfigPath, launchConfig);
  }, [launchConfig, launchConfigPath]);

  useWaitForSelectedInstance(async data => {
    const path = await join(data.path, "Bin", "Player.ini");
    setLaunchConfigPath(path);
    setLaunchConfig(await backend.readLaunchConfig(path));
  });

  // --- Scroll-spy ---
  const scrollRoot = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState("display");

  useEffect(() => {
    if (!launchConfig || !scrollRoot.current) return;
    const root = scrollRoot.current;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(
            (visible[0].target as HTMLElement).id.replace("section-", "")
          );
        }
      },
      { root, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );
    root.querySelectorAll("[data-section]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [launchConfig]);

  const onSelectNav = (id: string) => {
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onOpenConfig = async () => {
    await backend.open(launchConfigPath);
  };

  if (!launchConfig || !selectedInstanceData) return null;

  // --- Field helpers ---
  // For launchConfig sub-objects: immutable replace so React re-renders + effect persists.
  const cfgField = <
    K extends keyof BallanceLaunchConfig,
    P extends keyof BallanceLaunchConfig[K]
  >(
    section: K,
    key: P
  ): Field<BallanceLaunchConfig[K][P]> => ({
    get: () => launchConfig[section][key],
    set: v =>
      setLaunchConfig(prev =>
        prev
          ? {
              ...prev,
              [section]: { ...prev[section], [key]: v }
            }
          : prev
      )
  });

  // For options on selectedInstanceData: mutate + replace options ref.
  const optField = (key: keyof BallanceOptions): Field => ({
    get: () => selectedInstanceData.options[key],
    set: v =>
      mutateOptions(opts => {
        (opts as any)[key] = v;
      })
  });

  const openKeyChanger = (label: string, f: Field<number>) => {
    dialog.create({
      title: label,
      content: () => (
        <VirtualKeyboard
          t={k => k}
          value={f.get()}
          onChange={v => {
            f.set(v);
            dialog.destroyAll();
          }}
        />
      )
    });
  };

  const keyBindings: { key: keyof BallanceOptions; label: string }[] = [
    {
      key: "keyForward",
      label: t("gameConfig.inGameOptions.keyForward.label")
    },
    {
      key: "keyBackward",
      label: t("gameConfig.inGameOptions.keyBackward.label")
    },
    { key: "keyLeft", label: t("gameConfig.inGameOptions.keyLeft.label") },
    { key: "keyRight", label: t("gameConfig.inGameOptions.keyRight.label") },
    {
      key: "keyLiftCam",
      label: t("gameConfig.inGameOptions.keyLiftCam.label")
    },
    {
      key: "keyRotateCam",
      label: t("gameConfig.inGameOptions.keyRotateCam.label")
    }
  ];

  const navItems: (NavItem & { id: string })[] = [
    { id: "display", label: t("gameConfig.nav.display"), icon: Monitor },
    { id: "audio", label: t("gameConfig.nav.audio"), icon: Volume2 },
    { id: "controls", label: t("gameConfig.nav.controls"), icon: Gamepad2 },
    { id: "gameplay", label: t("gameConfig.nav.gameplay"), icon: BookOpen },
    { id: "compat", label: t("gameConfig.nav.compat"), icon: Wrench },
    { id: "graphics", label: t("gameConfig.nav.graphics"), icon: ImageIcon },
    {
      id: "advanced",
      label: t("gameConfig.nav.advanced"),
      icon: TriangleAlert,
      badge: t("common.advanced")
    },
    {
      id: "startup",
      label: t("gameConfig.nav.startup"),
      icon: Bug,
      badge: t("common.advanced")
    }
  ];

  const displaySchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.graphics.resolution.label"),
      type: "number-pair",
      field: cfgField("Graphics", "Width"),
      field2: cfgField("Graphics", "Height")
    },
    {
      label: t("gameConfig.graphics.fullScreen.label"),
      type: "switch",
      field: cfgField("Graphics", "FullScreen")
    },
    {
      label: t("gameConfig.window.borderless.label"),
      tip: t("gameConfig.window.borderless.tip"),
      type: "switch",
      field: cfgField("Window", "Borderless")
    },
    {
      label: t("gameConfig.window.clipCursor.label"),
      type: "switch",
      field: cfgField("Window", "ClipCursor")
    },
    {
      label: t("gameConfig.window.alwaysHandleInput.label"),
      tip: t("gameConfig.window.alwaysHandleInput.tip"),
      type: "switch",
      field: cfgField("Window", "AlwaysHandleInput")
    },
    {
      label: t("gameConfig.window.childWindowRendering.label"),
      type: "switch",
      field: cfgField("Window", "ChildWindowRendering")
    },
    {
      label: t("gameConfig.window.position.label"),
      tip: t("gameConfig.window.position.tip"),
      type: "number-pair",
      field: cfgField("Window", "X"),
      field2: cfgField("Window", "Y")
    }
  ];

  const audioSchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.inGameOptions.volume.label"),
      tip: t("gameConfig.inGameOptions.volume.tip"),
      type: "slider",
      min: 0,
      max: 1,
      step: 0.01,
      format: (v: number) => `${(v * 100).toFixed(0)}%`,
      field: optField("volume")
    },
    {
      label: t("gameConfig.inGameOptions.syncToScreen.label"),
      type: "switch",
      field: optField("syncToScreen")
    }
  ];

  const gameplaySchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.game.language.label"),
      tip: t("gameConfig.game.language.tip"),
      type: "select",
      field: cfgField("Game", "Language"),
      options: [
        { value: 0, label: t("gameConfig.game.language.options.German") },
        { value: 1, label: t("gameConfig.game.language.options.English") },
        { value: 2, label: t("gameConfig.game.language.options.Spanish") },
        { value: 3, label: t("gameConfig.game.language.options.Italian") },
        { value: 4, label: t("gameConfig.game.language.options.French") }
      ]
    },
    {
      label: t("gameConfig.game.skipOpening.label"),
      tip: t("gameConfig.game.skipOpening.tip"),
      type: "switch",
      field: cfgField("Game", "SkipOpening")
    },
    {
      label: t("gameConfig.game.rookie.label"),
      tip: t("gameConfig.game.rookie.tip"),
      type: "switch",
      field: cfgField("Game", "Rookie")
    },
    {
      label: t("gameConfig.inGameOptions.cloudLayer.label"),
      type: "switch",
      field: optField("cloudLayer")
    }
  ];

  const compatSchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.game.unlockFramerate.label"),
      tip: t("gameConfig.game.unlockFramerate.tip"),
      type: "switch",
      field: cfgField("Game", "UnlockFramerate")
    },
    {
      label: t("gameConfig.game.unlockWidescreen.label"),
      tip: t("gameConfig.game.unlockWidescreen.tip"),
      type: "switch",
      field: cfgField("Game", "UnlockWidescreen")
    },
    {
      label: t("gameConfig.game.unlockHighResolution.label"),
      tip: t("gameConfig.game.unlockHighResolution.tip"),
      type: "switch",
      field: cfgField("Game", "UnlockHighResolution")
    },
    {
      label: t("gameConfig.game.applyHotfix.label"),
      type: "switch",
      field: cfgField("Game", "ApplyHotfix")
    }
  ];

  const graphicsSchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.graphics.driver.label"),
      type: "number",
      field: cfgField("Graphics", "Driver")
    },
    {
      label: t("gameConfig.graphics.antialias.label"),
      tip: t("gameConfig.graphics.antialias.tip"),
      type: "number",
      field: cfgField("Graphics", "Antialias")
    },
    {
      label: t("gameConfig.graphics.bitsPerPixel.label"),
      tip: t("gameConfig.graphics.bitsPerPixel.tip"),
      type: "number",
      field: cfgField("Graphics", "BitsPerPixel")
    },
    {
      label: t("gameConfig.graphics.vertexCache.label"),
      tip: t("gameConfig.graphics.vertexCache.tip"),
      type: "number",
      field: cfgField("Graphics", "VertexCache")
    },
    {
      label: t("gameConfig.graphics.spriteVideoFormat.label"),
      type: "input",
      field: cfgField("Graphics", "SpriteVideoFormat")
    },
    {
      label: t("gameConfig.graphics.textureVideoFormat.label"),
      type: "input",
      field: cfgField("Graphics", "TextureVideoFormat")
    }
  ];

  const advancedSchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.graphics.disableDithering.label"),
      type: "switch",
      field: cfgField("Graphics", "DisableDithering")
    },
    {
      label: t("gameConfig.graphics.disableSpecular.label"),
      type: "switch",
      field: cfgField("Graphics", "DisableSpecular")
    },
    {
      label: t("gameConfig.graphics.disableMipmap.label"),
      type: "switch",
      field: cfgField("Graphics", "DisableMipmap")
    },
    {
      label: t("gameConfig.graphics.disablePerspectiveCorrection.label"),
      type: "switch",
      field: cfgField("Graphics", "DisablePerspectiveCorrection")
    },
    {
      label: t("gameConfig.graphics.disableFilter.label"),
      type: "switch",
      field: cfgField("Graphics", "DisableFilter")
    },
    {
      label: t("gameConfig.graphics.forceLinearFog.label"),
      type: "switch",
      field: cfgField("Graphics", "ForceLinearFog")
    },
    {
      label: t("gameConfig.graphics.forceSoftware.label"),
      type: "switch",
      field: cfgField("Graphics", "ForceSoftware")
    },
    {
      label: t("gameConfig.graphics.ensureVertexShader.label"),
      type: "switch",
      field: cfgField("Graphics", "EnsureVertexShader")
    },
    {
      label: t("gameConfig.graphics.useIndexBuffers.label"),
      type: "switch",
      field: cfgField("Graphics", "UseIndexBuffers")
    },
    {
      label: t("gameConfig.graphics.sortTransparentObjects.label"),
      type: "switch",
      field: cfgField("Graphics", "SortTransparentObjects")
    },
    {
      label: t("gameConfig.graphics.textureCacheManagement.label"),
      type: "switch",
      field: cfgField("Graphics", "TextureCacheManagement")
    },
    {
      label: t("gameConfig.graphics.enableDebugMode.label"),
      tip: t("gameConfig.graphics.enableDebugMode.tip"),
      type: "switch",
      field: cfgField("Graphics", "EnableDebugMode")
    },
    {
      label: t("gameConfig.graphics.enableScreenDump.label"),
      type: "switch",
      field: cfgField("Graphics", "EnableScreenDump")
    }
  ];

  const startupSchema: (Schema & SchemaItem)[] = [
    {
      label: t("gameConfig.startup.logMode.label"),
      tip: t("gameConfig.startup.logMode.tip"),
      type: "switch",
      field: cfgField("Startup", "LogMode")
    },
    {
      label: t("gameConfig.startup.verbose.label"),
      type: "switch",
      field: cfgField("Startup", "Verbose")
    },
    {
      label: t("gameConfig.startup.manualSetup.label"),
      tip: t("gameConfig.startup.manualSetup.tip"),
      type: "switch",
      field: cfgField("Startup", "ManualSetup")
    },
    {
      label: t("gameConfig.game.debug.label"),
      tip: t("gameConfig.game.debug.tip"),
      type: "switch",
      field: cfgField("Game", "Debug")
    }
  ];

  return (
    <div className="flex h-full">
      <aside className="flex w-48 shrink-0 flex-col border-r">
        <SettingsNav
          items={navItems}
          activeId={activeId}
          onSelect={onSelectNav}
        />
      </aside>

      <div ref={scrollRoot} className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur">
          <h1 className="text-base font-semibold">{t("menu.options")}</h1>
          <Button variant="ghost" size="sm" onClick={onOpenConfig}>
            <FileText className="size-4" />
            {t("gameConfig.openConfigFile")}
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <section id="section-display" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.display")} icon={Monitor}>
              <NFormWrapper schema={displaySchema} />
            </FormSection>
          </section>

          <section id="section-audio" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.audio")} icon={Volume2}>
              <NFormWrapper schema={audioSchema} />
            </FormSection>
          </section>

          <section id="section-controls" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.controls")} icon={Gamepad2}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {keyBindings.map(k => (
                  <div key={k.key} className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {k.label}
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openKeyChanger(k.label, {
                          get: () =>
                            selectedInstanceData.options[
                              k.key
                            ] as unknown as number,
                          set: v =>
                            mutateOptions(opts => {
                              (opts as any)[k.key] = v;
                            })
                        })
                      }
                    >
                      {getKeyName(
                        selectedInstanceData.options[k.key] as unknown as number
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("gameConfig.inGameOptions.invertCamRotation.label")}
                </Label>
                <Switch
                  checked={!!selectedInstanceData.options.invertCamRotation}
                  onCheckedChange={v =>
                    mutateOptions(opts => {
                      opts.invertCamRotation = v;
                    })
                  }
                />
              </div>
            </FormSection>
          </section>

          <section id="section-gameplay" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.gameplay")} icon={BookOpen}>
              <NFormWrapper schema={gameplaySchema} />
            </FormSection>
          </section>

          <section id="section-compat" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.compat")} icon={Wrench}>
              <NFormWrapper schema={compatSchema} />
            </FormSection>
          </section>

          <section id="section-graphics" data-section className="scroll-mt-16">
            <FormSection title={t("gameConfig.nav.graphics")} icon={ImageIcon}>
              <NFormWrapper schema={graphicsSchema} />
            </FormSection>
          </section>

          <section id="section-advanced" data-section className="scroll-mt-16">
            <FormSection
              title={t("gameConfig.nav.advanced")}
              icon={TriangleAlert}
              badge={t("common.advanced")}
            >
              <NFormWrapper schema={advancedSchema} />
            </FormSection>
          </section>

          <section id="section-startup" data-section className="scroll-mt-16">
            <FormSection
              title={t("gameConfig.nav.startup")}
              icon={Bug}
              badge={t("common.advanced")}
            >
              <NFormWrapper schema={startupSchema} />
            </FormSection>
          </section>
        </div>
      </div>
    </div>
  );
}
