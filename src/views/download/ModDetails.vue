<script setup lang="ts">
import BasicConfig from "@/components/BasicConfig.vue";
import { computed } from "vue";

const props = defineProps<{
  file: YsFile;
}>();
const notes = computed(() => props.file.notes.split("|").map(x => x.trim()));
</script>

<template>
  <div style="margin-left: 0; margin-right: var(--d-margin-sm)">
    <BasicConfig
      title=""
      :tooltip="`注意：该 Mod 需要游戏已安装 ${file.filename.endsWith('.bmodp') ? 'BML Plus' : 'BML'} 才能生效`"
    >
    </BasicConfig>
    <BasicConfig title="Mod 名称">
      {{ file.filename }}
    </BasicConfig>
    <BasicConfig title="Mod 作者">
      {{ notes[0] }}
    </BasicConfig>
    <BasicConfig title="Mod 说明">
      {{ notes[2] }}
    </BasicConfig>
    <BasicConfig title="文件大小">
      {{ file.size }}
    </BasicConfig>
    <BasicConfig title="上传时间">
      {{ file.uploadTime }}
    </BasicConfig>
  </div>
</template>
