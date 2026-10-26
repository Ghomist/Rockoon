import { Check } from "lucide-react";
import { useT } from "@/i18n";
import { usePrefStore } from "@/stores/pref";
import { ACCENTS } from "@/utils/theme";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

/** 主题色色板：点一下立即生效（背景动效也跟着换色） */
export default function AccentPicker() {
  const t = useT();
  const accent = usePrefStore(s => s.accent) ?? "sky";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACCENTS.map(a => {
        const active = a.id === accent;
        const label = t(`settings.accent.${a.id}`);
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => usePrefStore.setState({ accent: a.id })}
                className={cn(
                  "flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-all outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                  active && "ring-2 ring-foreground/70"
                )}
                style={{
                  background: `linear-gradient(135deg, oklch(0.68 ${a.c} ${a.h}), oklch(0.5 ${a.c} ${a.h}))`
                }}
              >
                {active && <Check className="size-3.5 text-white" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
