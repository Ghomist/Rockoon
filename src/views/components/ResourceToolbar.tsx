import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

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

/**
 * Shared top-right toolbar of every resource page:
 * `search? extra… | 导入 刷新 打开目录`. Keep the order and the styling
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
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="h-8 w-48 pl-8 text-sm lg:w-60"
          />
        </div>
      )}
      {extra && (
        <>
          {extra}
          <Separator orientation="vertical" className="h-5!" />
        </>
      )}
      <Button variant="outline" size="sm" onClick={onImport}>
        {t("resources.import.button")}
      </Button>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        {t("common.action.refresh")}
      </Button>
      <Button variant="outline" size="sm" onClick={onOpenFolder}>
        {t("common.action.openFolder")}
      </Button>
    </>
  );
}
