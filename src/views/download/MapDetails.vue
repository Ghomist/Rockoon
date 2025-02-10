<script setup lang="ts">
import BasicConfig from "@/components/BasicConfig.vue";
import { clampString } from "@/utils/format";

defineProps<{
  file: YsFile;
}>();
</script>

<template>
  <div style="margin-left: 0; margin-right: var(--d-margin-sm)">
    <BasicConfig
      v-if="!file.filename.endsWith('.nmo')"
      title=""
      tooltip="该地图可能无法直接游玩，下载完成后需要手动解压/安装配套插件"
    >
    </BasicConfig>
    <BasicConfig title="地图名称">
      {{ file.filename }}
    </BasicConfig>
    <BasicConfig title="地图大小">
      {{ file.size }}
    </BasicConfig>
    <BasicConfig title="上传时间">
      {{ file.uploadTime }}
    </BasicConfig>
    <BasicConfig title="所在分区">
      {{ file.category }}
    </BasicConfig>
    <BasicConfig title="地图备注">
      {{ clampString(file.notes, 30) || "无备注" }}
    </BasicConfig>
  </div>
</template>
