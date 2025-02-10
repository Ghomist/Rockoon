<script setup lang="ts">
import ballance from "@/api/ballance";
import BasicCollapse from "@/components/BasicCollapse.vue";
import BasicConfig from "@/components/BasicConfig.vue";
import BasicInput from "@/components/BasicInput.vue";
import BasicSwitch from "@/components/BasicSwitch.vue";
import KeyButton from "@/components/KeyButton.vue";
import { join } from "@tauri-apps/api/path";
import { onMounted, reactive, ref } from "vue";

const props = defineProps<{
  instancePath: string;
  configFile: ManagedFile;
}>();

defineExpose({
  save: async () => {
    if (configPath.value && config)
      await ballance.saveModConfig(configPath.value, config);
  }
});

const configPath = ref("");
const config = reactive<ModConfig>({ entries: {}, categories: {} });
onMounted(async () => {
  configPath.value = await join(
    props.instancePath,
    "ModLoader",
    "Configs",
    props.configFile.name
  );
  Object.assign(config, await ballance.readModConfig(configPath.value));
});
</script>

<template>
  <div style="width: var(--d-width-xl)">
    <BasicCollapse
      v-for="(configs, cat) in config?.entries"
      :title="cat.toString()"
      :summary="config?.categories[cat]"
      open
    >
      <BasicConfig v-for="c in configs" :title="c.name">
        <BasicSwitch v-if="c.datatype === 'B'" v-model="c.value" />
        <BasicInput v-else-if="c.datatype === 'S'" v-model="c.value" />
        <BasicInput
          v-else-if="c.datatype === 'I'"
          v-model="c.value"
          data-type="number"
        />
        <BasicInput
          v-else-if="c.datatype === 'F'"
          v-model="c.value"
          data-type="decimal"
        />
        <KeyButton v-else-if="c.datatype === 'K'" v-model="c.value" />
        <p v-else>{{ c.value }}</p>
      </BasicConfig>
    </BasicCollapse>
  </div>
</template>
