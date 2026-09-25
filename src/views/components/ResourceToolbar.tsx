import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
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
}

/**
 * Shared top-right toolbar of every resource page: `extra… | 导入 刷新 打开目录`.
 * Keep the order and the styling identical across pages.
 */
export default function ResourceToolbar({
  onImport,
  onRefresh,
  onOpenFolder,
  extra
}: Props) {
  const t = useT();
  return (
    <>
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
