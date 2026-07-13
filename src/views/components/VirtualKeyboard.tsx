import { useEffect, useRef } from "react";
import { message } from "@/utils/ui/feedback";
import { getKeyByPhysicCode, keySchema } from "./key";

interface Props {
  t: (key: string) => string;
  value: number;
  onChange: (v: number) => void;
}

export default function VirtualKeyboard({ t, value, onChange }: Props) {
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = getKeyByPhysicCode(e.code);
    if (key !== undefined) onChange(key);
    else message.warning(t("common.key.unavailableKey"));
  };

  return (
    <>
      <div
        ref={focusRef}
        tabIndex={0}
        className="outline-none"
        onBlur={() => focusRef.current?.focus()}
        onKeyDown={onKeyDown}
      />
      <p className="text-sm text-muted-foreground">
        {t("common.key.changeKeyTip")}
      </p>
      {keySchema.map((line, i) => (
        <div key={i} className="flex items-center">
          {line.map(k => (
            <button
              key={k.id + k.name}
              type="button"
              className={[
                "inline-flex h-9 items-center justify-center border border-r-0 last:border-r px-2 text-sm transition-colors",
                "last:rounded-r-md first:rounded-l-md",
                value === k.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent hover:text-accent-foreground",
                k.disabled && "pointer-events-none opacity-50"
              ].join(" ")}
              style={{ width: `${(k.width ?? 1) * 36}px` }}
              disabled={k.disabled}
              onClick={() => onChange(k.id)}
            >
              {k.display ?? k.name}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
