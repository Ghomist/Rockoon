import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TreeNode {
  key: string;
  label: string;
  children?: TreeNode[];
  isRoot?: boolean;
  disabled?: boolean;
}

interface Props {
  node: TreeNode;
  selectedKey: string | null;
  expandedKeys: Set<string>;
  depth?: number;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
}

export default function TreeItem({
  node,
  selectedKey,
  expandedKeys,
  depth = 0,
  onSelect,
  onToggle
}: Props) {
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);

  return (
    <li role="treeitem">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          node.disabled && "pointer-events-none opacity-50",
          selectedKey === node.key
            ? "bg-accent text-accent-foreground"
            : "text-foreground"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => !node.disabled && onSelect(node.key)}
      >
        {hasChildren ? (
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center"
            onClick={e => {
              e.stopPropagation();
              onToggle(node.key);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
        ) : (
          <span className="inline-block size-4 shrink-0" />
        )}
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.label}</span>
      </button>

      {hasChildren && isExpanded && (
        <ul role="group" className="m-0 p-0">
          {node.children!.map(child => (
            <TreeItem
              key={child.key}
              node={child}
              selectedKey={selectedKey}
              expandedKeys={expandedKeys}
              depth={depth + 1}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
