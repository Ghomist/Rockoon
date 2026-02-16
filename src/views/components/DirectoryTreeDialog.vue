<script setup lang="ts">
import backend from "@/backend";
import { join } from "@tauri-apps/api/path";
import { NButton, NEmpty, NFlex, NModal, NSpin, NText, NTree } from "naive-ui";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

interface Props {
  show: boolean;
  rootPath: string;
  currentPath: string;
  itemToMovePath?: string; // 要移动的项的相对路径（相对于 rootPath）
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:show": [value: boolean];
  confirm: [targetPath: string];
}>();

const { t } = useI18n();

type TreeNode = {
  key: string;
  label: string;
  children?: TreeNode[];
  isRoot?: boolean;
  disabled?: boolean;
};

const treeData = ref<TreeNode[]>([]);
const selectedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const loading = ref(false);

// 计算选中的目标路径
const selectedTargetPath = ref("");

// 监听选中的键值变化，更新目标路径
watch(selectedKeys, async keys => {
  if (keys.length === 0) {
    selectedTargetPath.value = "";
    return;
  }
  const key = keys[0];
  if (key === "__root__") {
    selectedTargetPath.value = props.rootPath;
  } else {
    selectedTargetPath.value = await join(props.rootPath, key);
  }
});

// 递归构建树形结构
const buildTree = async (
  path: string,
  relativePath: string = ""
): Promise<TreeNode[]> => {
  const nodes: TreeNode[] = [];

  try {
    const dirs = await backend.listDirs(path);
    for (const dir of dirs) {
      const dirName = dir.split(/[\\/]/).pop()!;
      const currentRelativePath = relativePath
        ? await join(relativePath, dirName)
        : dirName;

      // 判断是否应该禁用此节点
      const shouldDisable = props.itemToMovePath
        ? currentRelativePath === props.itemToMovePath ||
          currentRelativePath.startsWith(props.itemToMovePath + "/")
        : false;

      // 如果节点应该被禁用，就不加载其子节点（这样就不能展开了）
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
        // 递归加载子目录
        const fullPath = await join(path, dirName);
        const children = await buildTree(fullPath, currentRelativePath);
        if (children.length > 0) {
          node.children = children;
        }
      } catch {
        // 如果无法加载子目录，就跳过
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
    // 添加根节点
    treeData.value = [
      {
        key: "__root__",
        label: t("resources.breadcrumb.root"),
        isRoot: true,
        children: subTree.length > 0 ? subTree : undefined
      }
    ];
    // 默认展开根节点
    expandedKeys.value = ["__root__"];
  } finally {
    loading.value = false;
  }
};

const handleConfirm = async () => {
  if (selectedKeys.value.length > 0) {
    const selectedKey = selectedKeys.value[0];
    const targetPath =
      selectedKey === "__root__"
        ? props.rootPath
        : await join(props.rootPath, selectedKey);
    emit("confirm", targetPath);
  }
};

const handleCancel = () => {
  emit("update:show", false);
  selectedKeys.value = [];
};

// 监听 show 变化，当对话框显示时加载数据
watch(
  () => props.show,
  newShow => {
    if (newShow && props.rootPath) {
      loadTree();
    } else if (!newShow) {
      // 对话框关闭时清理状态
      treeData.value = [];
      selectedKeys.value = [];
      expandedKeys.value = [];
    }
  }
);

// 监听 rootPath 变化，当路径准备好时重新加载
watch(
  () => props.rootPath,
  (newPath, oldPath) => {
    if (newPath && newPath !== oldPath && props.show) {
      loadTree();
    }
  }
);
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('resources.move.title')"
    :style="{ width: '600px' }"
    @update:show="emit('update:show', $event)"
  >
    <n-spin :show="loading">
      <n-empty
        v-if="!loading && treeData.length === 0"
        :description="t('resources.move.empty')"
      />
      <n-tree
        v-else
        selectable
        block-line
        key-field="key"
        label-field="label"
        style="padding: 12px 0"
        :data="treeData"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        @update:selected-keys="selectedKeys = $event"
        @update:expanded-keys="expandedKeys = $event"
      />
    </n-spin>

    <!-- 显示当前选中的路径 -->
    <div
      v-if="selectedTargetPath"
      style="
        margin-top: 12px;
        padding: 12px;
        background-color: var(--n-modal-color);
        border-radius: 4px;
        border: 1px solid var(--n-divider-color);
      "
    >
      <n-text depth="3" style="font-size: 12px">
        {{ t("resources.move.selectedPath") }}:
      </n-text>
      <n-text style="font-size: 12px; word-break: break-all">
        {{ selectedTargetPath }}
      </n-text>
    </div>

    <template #footer>
      <n-flex justify="end" :size="12">
        <n-button @click="handleCancel">
          {{ t("common.dialog.cancel") }}
        </n-button>
        <n-button
          type="primary"
          :disabled="selectedKeys.length === 0"
          @click="handleConfirm"
        >
          {{ t("common.dialog.confirm") }}
        </n-button>
      </n-flex>
    </template>
  </n-modal>
</template>
