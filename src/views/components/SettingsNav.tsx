import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string;
}

interface Props {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function SettingsNav({ items, activeId, onSelect }: Props) {
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <Button
            key={item.id}
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 justify-start gap-2 font-normal",
              activeId === item.id && "bg-secondary font-medium"
            )}
            onClick={() => onSelect(item.id)}
          >
            {Icon && <Icon className="size-4 shrink-0" />}
            <span className="truncate">{item.label}</span>
            {item.badge && (
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                {item.badge}
              </Badge>
            )}
          </Button>
        );
      })}
    </nav>
  );
}
