import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { findRouteItem } from "@/routers/menu";
import { resolveIcon } from "@/utils/icon";
import PageHeader from "./PageHeader";

interface Props {
  /** 副标题行（数量统计、面包屑之类）；页面名和图标按当前路由自动取 */
  title: ReactNode;
  actions?: ReactNode;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

export default function ListViewPage({
  title,
  actions,
  onScroll,
  children
}: Props) {
  const location = useLocation();
  const route = findRouteItem(location.pathname);
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={route ? resolveIcon(route.icon) : undefined}
        title={route?.label ?? title}
        // 有的页面把页面名本身当 title 传进来，那就别再重复一遍
        subtitle={route && title !== route.label ? title : undefined}
        actions={actions}
      />
      <div
        className="flex-1 overflow-auto bg-background/70"
        onScroll={onScroll}
      >
        <div className="stagger-rows divide-y divide-border/70">{children}</div>
      </div>
    </div>
  );
}
