import type { ReactNode } from "react";

interface Props {
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
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <p className="truncate text-sm font-medium">{title}</p>
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <div className="flex-1 overflow-auto" onScroll={onScroll}>
        <div className="divide-y">{children}</div>
      </div>
    </div>
  );
}
