<script setup lang="ts">
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";

defineProps<{
  cache: YsCache;
}>();
</script>

<template>
  <BasicCollapse
    v-for="folder of cache.folders"
    :title="folder.name"
    :summary="folder.notes"
  >
    <BasicConfig
      v-for="file of cache.files[folder.id]"
      :title="file.filename"
    ></BasicConfig>
  </BasicCollapse>
</template>
