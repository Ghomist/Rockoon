<script setup lang="ts">
import BasicNavItem from "@/components/BasicNavItem.vue";
import { useAppStore } from "@/stores/app";
import { useInstancesStore } from "@/stores/instances";
import { checkFiles } from "@/backend/instance";
import { onMounted, ref } from "vue";

const props = defineProps<{
  checkBml?: boolean;
}>();

const app = useAppStore();
const fs = useInstancesStore();
const selected = ref(app.selectedInstanceData?.path);
const instances = ref<BallanceInstanceStore[]>([]);

defineExpose({ selectedPath: () => selected.value });

onMounted(async () => {
  if (props.checkBml) {
    for (const instance of fs.instances) {
      if (
        (await checkFiles(instance.path, "bml")) ||
        (await checkFiles(instance.path, "bmlp"))
      )
        instances.value.push(instance);
    }
  } else {
    instances.value = fs.instances;
  }
});
</script>

<template>
  <template v-if="fs.instances.length">
    <p
      v-if="checkBml && instances.length !== fs.instances.length"
      class="light"
    >
      此处仅显示有 BML 或 BMLPlus 的游戏
    </p>
    <TransitionGroup name="list">
      <BasicNavItem
        v-for="x in instances"
        :key="x.path"
        :name="x.path"
        :selected="selected === x.path"
        @clicked="selected = x.path"
      >
        {{ x.name }}
      </BasicNavItem>
    </TransitionGroup>
  </template>
  <p v-else>需要先安装游戏才能下载！</p>
</template>
