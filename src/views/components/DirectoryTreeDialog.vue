<script setup lang="ts">
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "@lucide/vue";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TreeItem, { type TreeNode } from "./TreeItem.vue";

interface Props {
  show: boolean;
  rootPath: string;
  currentPath: string;
  itemToMovePath?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:show": [value: boolean];
  confirm: [targetPath: string];
}>();

const { t } = useI18n();

const treeData = ref<TreeNode[]>([]);
const selectedKey = ref<string | null>(null);
const expandedKeys = ref<Set<string>>(new Set());
const loading = ref(false);
const selectedTargetPath = ref("");

const selectKey = async (key: string) => {
  selectedKey.value = key;
  if (key === "__root__") {
    selectedTargetPath.value = props.rootPath;
  } else {
    selectedTargetPath.value = await join(props.rootPath, key);
  }
};

const toggleExpand = (key: string) => {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedKeys.value = next;
};

const buildTree = async (
  path: string,
  relativePath = ""
): Promise<TreeNode[]> => {
  const nodes: TreeNode[] = [];
  try {
    const dirs = await backend.listDirs(path);
    for (const dir of dirs) {
      const dirName = dir.split(/[\\/]/).pop()!;
      const currentRelativePath = relativePath
        ? await join(relativePath, dirName)
        : dirName;
      const shouldDisable = props.itemToMovePath
        ? currentRelativePath === props.itemToMovePath ||
          currentRelativePath.startsWith(props.itemToMovePath + "/")
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
        const children = await buildTree(fullPath, currentRelativePath);
        if (children.length > 0) node.children = children;
      } catch {
        // skip
      }
      nodes.push(node);
    }
  } catch (error) {
    console.error("Failed to build tree:", error);
  }
  return nodes;
};

const loadTree = async () => {
  if (!props.rootPath) return;
  loading.value = true;
  try {
    const subTree = await buildTree(props.rootPath);
    treeData.value = [
      {
        key: "__root__",
        label: t("resources.breadcrumb.root"),
        isRoot: true,
        children: subTree.length > 0 ? subTree : undefined
      }
    ];
    expandedKeys.value = new Set(["__root__"]);
  } finally {
    loading.value = false;
  }
};

const handleConfirm = () => {
  if (selectedTargetPath.value) emit("confirm", selectedTargetPath.value);
};

watch(
  () => props.show,
  newShow => {
    if (newShow && props.rootPath) {
      loadTree();
    } else if (!newShow) {
      treeData.value = [];
      selectedKey.value = null;
      selectedTargetPath.value = "";
      expandedKeys.value = new Set();
    }
  }
);

watch(
  () => props.rootPath,
  (newPath, oldPath) => {
    if (newPath && newPath !== oldPath && props.show) loadTree();
  }
);
</script>

<template>
  <Dialog
    :open="show"
    @update:open="emit('update:show', $event)"
  >
    <DialogContent class="max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ t("resources.move.title") }}</DialogTitle>
      </DialogHeader>

      <div class="min-h-[200px]">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>
        <p
          v-else-if="treeData.length === 0"
          class="py-12 text-center text-sm text-muted-foreground"
        >
          {{ t("resources.move.empty") }}
        </p>
        <ul v-else class="py-1" role="tree">
          <TreeItem
            v-for="node in treeData"
            :key="node.key"
            :node="node"
            :selected-key="selectedKey"
            :expanded-keys="expandedKeys"
            @select="selectKey"
            @toggle="toggleExpand"
          />
        </ul>
      </div>

      <div
        v-if="selectedTargetPath"
        class="mt-3 rounded-md border bg-muted/30 px-3 py-2"
      >
        <p class="text-xs text-muted-foreground">
          {{ t("resources.move.selectedPath") }}:
        </p>
        <p class="break-all text-xs">{{ selectedTargetPath }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:show', false)">
          {{ t("common.dialog.cancel") }}
        </Button>
        <Button :disabled="!selectedKey" @click="handleConfirm">
          {{ t("common.dialog.confirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
