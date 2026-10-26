import type { ReactNode } from "react";
import { FolderOpen, Import, RefreshCw, Search } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface Props {
  /** Import every format this page understands (native files + brp packages). */
  onImport: () => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
  /**
   * Page specific buttons (e.g. "New Folder" for maps). Rendered on the left of
   * the shared trio, separated from it by a vertical rule.
   */
  extra?: ReactNode;
  /** 可选：列表模糊搜索（不传就不显示搜索框） */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
}

/** 只有图标的按钮，名字放 tooltip */
export function IconAction({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * 资源类页面右上角的统一样式：次要操作（刷新、打开目录、新建…）是带 tooltip 的
 * 图标按钮，主操作（导入、保存）是一个带图标的实心按钮，放在最右。
 *
 * Shared top-right toolbar of every resource page:
 * `search? extra… | 刷新 打开目录 导入`. Keep the order and the styling
 * identical across pages.
 */
export default function ResourceToolbar({
  onImport,
  onRefresh,
  onOpenFolder,
  extra,
  search
}: Props) {
  const t = useT();
  return (
    <>
      {search && (
        <div className="relative mr-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="h-8 w-44 bg-background pl-8 text-sm lg:w-56"
          />
        </div>
      )}
      {extra && (
        <>
          {extra}
          <Separator orientation="vertical" className="mx-1 h-5!" />
        </>
      )}
      <IconAction label={t("common.action.refresh")} onClick={onRefresh}>
        <RefreshCw />
      </IconAction>
      <IconAction label={t("common.action.openFolder")} onClick={onOpenFolder}>
        <FolderOpen />
      </IconAction>
      <Button size="sm" className="ml-1" onClick={onImport}>
        <Import />
        {t("resources.import.button")}
      </Button>
    </>
  );
}
