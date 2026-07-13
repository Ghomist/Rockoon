<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight, ChevronDown, Folder } from "@lucide/vue";
import { cn } from "@/lib/utils";

export interface TreeNode {
  key: string;
  label: string;
  children?: TreeNode[];
  isRoot?: boolean;
  disabled?: boolean;
}

const props = defineProps<{
  node: TreeNode;
  selectedKey: string | null;
  expandedKeys: Set<string>;
  depth?: number;
}>();

const emit = defineEmits<{
  select: [key: string];
  toggle: [key: string];
}>();

const depth = computed(() => props.depth ?? 0);
const hasChildren = computed(
  () => !!props.node.children && props.node.children.length > 0
);
const isExpanded = computed(() => props.expandedKeys.has(props.node.key));
</script>

<template>
  <li role="treeitem">
    <button
      type="button"
      :class="
        cn(
          'flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          node.disabled && 'pointer-events-none opacity-50',
          selectedKey === node.key
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground'
        )
      "
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="!node.disabled && emit('select', node.key)"
    >
      <span
        v-if="hasChildren"
        class="inline-flex size-4 shrink-0 items-center justify-center"
        @click.stop="emit('toggle', node.key)"
      >
        <ChevronDown v-if="isExpanded" class="size-4" />
        <ChevronRight v-else class="size-4" />
      </span>
      <span v-else class="inline-block size-4 shrink-0" />
      <Folder class="size-4 shrink-0 text-muted-foreground" />
      <span class="truncate">{{ node.label }}</span>
    </button>

    <ul v-if="hasChildren && isExpanded" role="group">
      <TreeItem
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :selected-key="selectedKey"
        :expanded-keys="expandedKeys"
        :depth="depth + 1"
        @select="k => emit('select', k)"
        @toggle="k => emit('toggle', k)"
      />
    </ul>
  </li>
</template>
