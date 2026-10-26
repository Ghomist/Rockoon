import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RowProps {
  /** 行首控件（开关等），在图标块之前 */
  leading?: ReactNode;
  icon: ReactNode;
  /** 图标块底色，默认主色淡底 */
  iconClassName?: string;
  title: ReactNode;
  meta?: ReactNode;
  /** 已禁用的条目：名字划线变淡 */
  dimmed?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}

/** 资源列表的一行：图标块 + 名字 / 元信息 + 右侧操作。各资源页共用同一套样式 */
export function ResourceRow({
  leading,
  icon,
  iconClassName,
  title,
  meta,
  dimmed,
  onClick,
  actions
}: RowProps) {
  return (
    <div
      className={cn(
        "group/row flex items-center gap-3 px-5 py-2 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/60"
      )}
      onClick={onClick}
    >
      {leading && (
        <div className="flex shrink-0" onClick={e => e.stopPropagation()}>
          {leading}
        </div>
      )}
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-opacity [&_svg]:size-4",
          dimmed && "opacity-40",
          iconClassName
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-sm font-medium",
            dimmed &&
              "text-muted-foreground line-through decoration-muted-foreground/60"
          )}
        >
          {title}
        </span>
        {meta && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={e => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** 行尾的图标操作：平时淡一点，悬停到这一行才显眼 */
export function RowAction({
  label,
  onClick,
  destructive,
  children
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "text-muted-foreground opacity-60 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100",
            destructive &&
              "hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** 文件后缀小标签 */
export function ExtTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border px-1 py-px font-mono text-[10px] leading-none tracking-wide uppercase">
      {children}
    </span>
  );
}

/** 列表为空 / 搜索无结果 */
export function EmptyState({
  icon,
  title,
  hint
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      {icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
