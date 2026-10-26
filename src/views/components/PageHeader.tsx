import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** 各页面顶部统一的标题栏：图标块 + 页面名 + 副标题 + 右侧操作 */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className
}: Props) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-3 border-b bg-background/85 px-5 py-3 backdrop-blur-sm",
        className
      )}
    >
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset">
          <Icon className="size-4.5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-[15px] leading-tight font-semibold">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-0.5 flex min-w-0 items-center truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </header>
  );
}
