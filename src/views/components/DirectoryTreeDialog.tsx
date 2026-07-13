import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import backend from "@/backend";
import { useT } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TreeItem, { type TreeNode } from "./TreeItem";

interface Props {
  show: boolean;
  rootPath: string;
  currentPath?: string;
  itemToMovePath?: string;
  onClose: () => void;
  onConfirm: (targetPath: string) => void;
}

async function buildTree(
  path: string,
  relativePath: string,
  itemToMovePath: string | undefined
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  try {
    const dirs = await backend.listDirs(path);
    for (const dir of dirs) {
      const dirName = dir.split(/[\\/]/).pop()!;
      const currentRelativePath = relativePath
        ? await join(relativePath, dirName)
        : dirName;
      const shouldDisable = itemToMovePath
        ? currentRelativePath === itemToMovePath ||
          currentRelativePath.startsWith(itemToMovePath + "/")
        : false;
      if (shouldDisable) {
        nodes.push({
          key: currentRelativePath,
          label: dirName,
          disabled: true
        });
        continue;
      }
      const node: TreeNode = {
        key: currentRelativePath,
        label: dirName,
        disabled: false
      };
      try {
        const fullPath = await join(path, dirName);
        const children = await buildTree(
          fullPath,
          currentRelativePath,
          itemToMovePath
        );
        if (children.length > 0) node.children = children;
      } catch {
        // skip unreadable
      }
      nodes.push(node);
    }
  } catch (error) {
    console.error("Failed to build tree:", error);
  }
  return nodes;
}

export default function DirectoryTreeDialog({
  show,
  rootPath,
  currentPath: _currentPath,
  itemToMovePath,
  onClose,
  onConfirm
}: Props) {
  const t = useT();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedTargetPath, setSelectedTargetPath] = useState("");

  const selectKey = async (key: string) => {
    setSelectedKey(key);
    if (key === "__root__") {
      setSelectedTargetPath(rootPath);
    } else {
      setSelectedTargetPath(await join(rootPath, key));
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const loadTree = async () => {
    if (!rootPath) return;
    setLoading(true);
    try {
      const subTree = await buildTree(rootPath, "", itemToMovePath);
      setTreeData([
        {
          key: "__root__",
          label: t("resources.breadcrumb.root"),
          isRoot: true,
          children: subTree.length > 0 ? subTree : undefined
        }
      ]);
      setExpandedKeys(new Set(["__root__"]));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && rootPath) {
      loadTree();
    } else if (!show) {
      setTreeData([]);
      setSelectedKey(null);
      setSelectedTargetPath("");
      setExpandedKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, rootPath]);

  const handleConfirm = () => {
    if (selectedTargetPath) onConfirm(selectedTargetPath);
  };

  return (
    <Dialog open={show} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("resources.move.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : treeData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("resources.move.empty")}
            </p>
          ) : (
            <ul className="m-0 p-1" role="tree">
              {treeData.map(node => (
                <TreeItem
                  key={node.key}
                  node={node}
                  selectedKey={selectedKey}
                  expandedKeys={expandedKeys}
                  onSelect={selectKey}
                  onToggle={toggleExpand}
                />
              ))}
            </ul>
          )}
        </div>

        {selectedTargetPath && (
          <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("resources.move.selectedPath")}:
            </p>
            <p className="break-all text-xs">{selectedTargetPath}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.dialog.cancel")}
          </Button>
          <Button disabled={!selectedKey} onClick={handleConfirm}>
            {t("common.dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
