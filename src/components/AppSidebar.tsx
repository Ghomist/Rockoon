import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Circle,
  type LucideIcon
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getMenuItems, getExternalLinks, type MenuItem } from "@/routers/menu";

interface AppSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

type LeafItem = Extract<MenuItem, { route: string }>;

const resolveIcon = (name: string): LucideIcon => {
  const pascal = name
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return (
    (LucideIcons as unknown as Record<string, LucideIcon>)[pascal] ?? Circle
  );
};

const openExternal = (url: string) => {
  import("@tauri-apps/plugin-shell").then(m => m.open(url));
};

export default function AppSidebar({
  collapsed,
  onCollapsedChange
}: AppSidebarProps) {
  const location = useLocation();
  const items = getMenuItems();
  const externals = getExternalLinks();

  // Auto-open the group containing the current route.
  const initialOpenLabel = (() => {
    for (const it of items) {
      if (it !== "-" && "children" in it && it.children) {
        if (
          it.children.some(
            c => c !== "-" && location.pathname.startsWith(c.route)
          )
        ) {
          return it.label;
        }
      }
    }
    return "";
  })();

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(initialOpenLabel ? [initialOpenLabel] : [])
  );

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActive = (it: LeafItem) =>
    location.pathname === it.route ||
    location.pathname.startsWith(it.route + "/");

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-[width] duration-150",
        collapsed ? "w-[52px]" : "w-[180px]"
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {items.map((item, idx) => {
          if (item === "-") {
            return <div key={`sep-${idx}`} className="my-2 mx-2 border-t" />;
          }
          if ("view" in item && item.view) {
            const Icon = resolveIcon(item.icon);
            return (
              <Link
                key={item.route}
                to={item.route}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive(item)
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground",
                  collapsed && "justify-center"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          }
          if ("children" in item) {
            const Icon = resolveIcon(item.icon);
            const open = openGroups.has(item.label);
            return (
              <Collapsible
                key={item.route}
                open={open}
                onOpenChange={() => toggleGroup(item.label)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground text-foreground",
                      collapsed && "justify-center"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 text-left">{item.label}</span>
                    )}
                    {!collapsed && (
                      <ChevronDown
                        className={cn(
                          "size-4 opacity-60",
                          open ? "" : "-rotate-90"
                        )}
                      />
                    )}
                  </button>
                </CollapsibleTrigger>
                {!collapsed && (
                  <CollapsibleContent>
                    {item.children.map((child, cidx) => {
                      if (child === "-") {
                        return (
                          <div
                            key={`sep-${cidx}`}
                            className="my-1 mx-2 border-t"
                          />
                        );
                      }
                      const ChildIcon = resolveIcon(child.icon);
                      return (
                        <Link
                          key={child.route}
                          to={child.route}
                          className={cn(
                            "ml-6 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            isActive(child)
                              ? "bg-accent text-accent-foreground font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          <ChildIcon className="size-4 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          }
          return null;
        })}
      </nav>

      {!collapsed && (
        <div className="border-t px-2 py-2">
          {externals.map(link => {
            const Icon = resolveIcon(link.icon);
            return (
              <button
                key={link.url}
                type="button"
                onClick={() => openExternal(link.url)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{link.label}</span>
                <ExternalLink className="size-3 opacity-60" />
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              collapsed ? "" : "rotate-180"
            )}
          />
        </Button>
      </div>
    </aside>
  );
}
