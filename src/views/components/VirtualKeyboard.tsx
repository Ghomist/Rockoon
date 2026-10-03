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
      {/* 一行约 540px：窗口再窄也不能把内容顶出去。横向滚动作为兜底，
          但把滚动条藏起来（用户要求弹窗里不出现横向滚动条）。 */}
      <div className="flex w-full flex-col items-start overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {keySchema.map((line, i) => (
          <div key={i} className="flex items-center">
            {line.map(k => (
              <button
                key={k.id + k.name}
                type="button"
                className={[
                  "inline-flex h-9 items-center justify-center border border-r-0 px-2 text-sm transition-colors last:border-r",
                  "last:rounded-r-md first:rounded-l-md",
                  value === k.id
                    ? "border-primary bg-primary text-primary-foreground"
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
      </div>
    </>
  );
}
