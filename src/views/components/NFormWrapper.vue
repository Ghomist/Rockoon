<script setup lang="ts">
import { dialog } from "@/utils/ui/feedback";
import { useElementSize } from "@vueuse/core";
import {
  DataTableProps,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NScrollbar,
  NSelect,
  NSlider,
  NSwitch,
  NText
} from "naive-ui";
import { h, MaybeRef, onMounted, ref, watchEffect } from "vue";
import { getKeyName } from "./key";
import VirtualKeyboard from "./VirtualKeyboard.vue";

export type SelectSchema = {
  type: "select";
  options: { value: any; label: string }[];
};
export type InputSchema = {
  type: "input";
};
export type SwitchSchema = {
  type: "switch";
};
export type SliderSchema = {
  type: "slider";
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
};
export type NumberSchema = {
  type: "number";
};
export type NumberPairSchema = {
  type: "number-pair";
  valueRef2: MaybeRef<any>;
};
export type ButtonSchema = {
  type: "button";
  onClick?: () => void;
};
export type KeySchema = {
  type: "key";
};
export type TableSchema = {
  type: "table";
} & DataTableProps;
export type Schema =
  | SelectSchema
  | InputSchema
  | SwitchSchema
  | SliderSchema
  | NumberSchema
  | NumberPairSchema
  | ButtonSchema
  | KeySchema
  | TableSchema;
export type SchemaItem = {
  label: string;
  valueRef?: MaybeRef<any>;
  tip?: string;
};

defineProps<{
  schema: (Schema & SchemaItem)[];
}>();

const containerRef = ref<HTMLDivElement>();
const labelWidth = ref(600);

onMounted(() => {
  if (containerRef.value) {
    const { width } = useElementSize(containerRef.value);
    watchEffect(() => {
      labelWidth.value = width.value * 0.7;
    });
  }
});
</script>

<template>
  <div ref="containerRef" style="height: 100%">
    <n-scrollbar style="height: 100%">
      <n-form
        label-placement="left"
        label-align="left"
        :label-width="labelWidth"
      >
        <n-form-item
          v-for="x in schema"
          :key="x.label"
          :show-label="x.type !== 'table'"
        >
          <template #label>
            <n-text style="margin-right: 8px"> {{ x.label }} </n-text>
            <n-text depth="3"> {{ x.tip }} </n-text>
          </template>
          <n-select
            v-if="x.type === 'select'"
            v-model:value="x.valueRef.value"
            :options="x.options"
          />
          <n-input
            v-else-if="x.type === 'input'"
            v-model:value="x.valueRef.value"
          />
          <n-switch
            v-else-if="x.type === 'switch'"
            v-model:value="x.valueRef.value"
          />
          <n-slider
            v-else-if="x.type === 'slider'"
            v-model:value="x.valueRef.value"
            :min="x.min"
            :max="x.max"
            :step="x.step"
            :format-tooltip="x.format"
          />
          <n-input-number
            v-else-if="x.type === 'number'"
            v-model:value="x.valueRef.value"
            :show-button="false"
          />
          <template v-else-if="x.type === 'number-pair'">
            <n-input-number
              v-model:value="x.valueRef.value"
              :show-button="false"
            />
            <n-text style="margin: 0 8px"> x </n-text>
            <n-input-number
              v-model:value="x.valueRef.value"
              :show-button="false"
            />
          </template>
          <n-button v-else-if="x.type === 'button'" @click="x.onClick">
            {{ x.label }}
          </n-button>
          <n-button
            v-else-if="x.type === 'key'"
            @click="
              () => {
                dialog.create({
                  title: $t('common.key.changeKeyTitle') + ' - ' + x.label,
                  style: {
                    width: 'fit-content'
                  },
                  content: () =>
                    h(VirtualKeyboard, {
                      t: $t,
                      modelValue: x.valueRef.value as number,
                      'onUpdate:modelValue': (v: number) => {
                        x.valueRef.value = v;
                        dialog.destroyAll();
                      }
                    })
                });
              }
            "
          >
            {{ getKeyName(x.valueRef.value) }}
          </n-button>
          <n-data-table v-else-if="x.type === 'table'" v-bind="x" />
        </n-form-item>
      </n-form>
    </n-scrollbar>
  </div>
</template>
