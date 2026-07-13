<script setup lang="ts">
import { dialog } from "@/utils/ui/feedback";
import { onMounted, ref, watchEffect, type MaybeRef, h } from "vue";
import { useElementSize } from "@vueuse/core";
import { getKeyName } from "./key";
import VirtualKeyboard from "./VirtualKeyboard.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import { CircleHelp } from "@lucide/vue";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

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
  data?: any[];
  columns?: { key: string; title: string; render?: (row: any) => any }[];
};
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
const labelWidth = ref(220);

onMounted(() => {
  if (containerRef.value) {
    const { width } = useElementSize(containerRef.value);
    watchEffect(() => {
      // Label takes up to ~35% of width, clamped to readable bounds.
      labelWidth.value = Math.max(140, Math.min(360, width.value * 0.35));
    });
  }
});

// Unwrap helper: many callers pass toRef(store) refs.
const unwrap = (r: MaybeRef<any>) =>
  r && typeof r === "object" && "value" in r ? (r as any).value : r;

const findOptionLabel = (
  options: { value: any; label: string }[],
  v: any
): string | undefined => options.find(o => o.value === v)?.label;

const setRef = (r: MaybeRef<any> | undefined, v: any) => {
  if (r && typeof r === "object" && "value" in r) (r as any).value = v;
};

const openKeyChanger = (label: string, valueRef: any) => {
  dialog.create({
    title: `${label}`,
    content: () =>
      h(VirtualKeyboard, {
        t: (k: string) => k,
        modelValue: valueRef.value as number,
        "onUpdate:modelValue": (v: number) => {
          valueRef.value = v;
          dialog.destroyAll();
        }
      })
  });
};
</script>

<template>
  <div ref="containerRef" class="h-full">
    <div class="h-full overflow-auto">
      <div class="flex flex-col">
        <div
          v-for="(x, i) in schema"
          :key="i"
          class="flex flex-col gap-2 border-b py-3 last:border-b-0 md:flex-row md:items-start"
        >
          <!-- Label column -->
          <div
            class="shrink-0 pt-2 md:pr-4"
            :style="{ width: `${labelWidth}px` }"
          >
            <div class="flex items-center gap-1">
              <Label class="text-sm font-medium">{{ x.label }}</Label>
              <HoverCard v-if="x.tip">
                <HoverCardTrigger as-child>
                  <button
                    type="button"
                    class="text-muted-foreground/70 transition-colors hover:text-foreground"
                    tabindex="-1"
                  >
                    <CircleHelp class="size-3.5" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent
                  side="top"
                  class="w-72 text-xs leading-relaxed"
                >
                  {{ x.tip }}
                </HoverCardContent>
              </HoverCard>
            </div>
          </div>

          <!-- Control column -->
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <template v-if="x.type === 'select' && x.valueRef">
              <Select
                :model-value="String(unwrap(x.valueRef))"
                @update:model-value="
                  v => {
                    const orig = unwrap(x.valueRef);
                    const cast = typeof orig === 'number' ? Number(v) : v;
                    setRef(x.valueRef, cast);
                  }
                "
              >
                <SelectTrigger class="w-full md:w-[240px]">
                  <SelectValue
                    :placeholder="
                      findOptionLabel(x.options, unwrap(x.valueRef)) ?? ''
                    "
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in x.options"
                    :key="opt.value"
                    :value="String(opt.value)"
                  >
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </template>

            <Input
              v-else-if="x.type === 'input' && x.valueRef"
              :model-value="unwrap(x.valueRef)"
              @update:model-value="v => setRef(x.valueRef, v)"
            />

            <Switch
              v-else-if="x.type === 'switch' && x.valueRef"
              :model-value="!!unwrap(x.valueRef)"
              @update:model-value="v => setRef(x.valueRef, v)"
            />

            <div
              v-else-if="x.type === 'slider' && x.valueRef"
              class="flex w-full max-w-[280px] items-center gap-3"
            >
              <Slider
                :model-value="[Number(unwrap(x.valueRef))]"
                :min="x.min ?? 0"
                :max="x.max ?? 100"
                :step="x.step ?? 1"
                class="flex-1"
                @update:model-value="(arr: number[] | undefined) => setRef(x.valueRef, arr?.[0])"
              />
              <span class="w-16 shrink-0 text-right text-xs tabular-nums">
                {{ x.format ? x.format(Number(unwrap(x.valueRef))) : unwrap(x.valueRef) }}
              </span>
            </div>

            <Input
              v-else-if="x.type === 'number' && x.valueRef"
              type="number"
              :model-value="unwrap(x.valueRef)"
              @update:model-value="v => setRef(x.valueRef, Number(v))"
            />

            <template v-else-if="x.type === 'number-pair' && x.valueRef">
              <Input
                type="number"
                class="w-24"
                :model-value="unwrap(x.valueRef)"
                @update:model-value="v => setRef(x.valueRef, Number(v))"
              />
              <span class="text-muted-foreground">×</span>
              <Input
                type="number"
                class="w-24"
                :model-value="unwrap(x.valueRef2)"
                @update:model-value="v => setRef(x.valueRef2, Number(v))"
              />
            </template>

            <Button
              v-else-if="x.type === 'button'"
              variant="outline"
              size="sm"
              @click="x.onClick"
            >
              {{ x.label }}
            </Button>

            <Button
              v-else-if="x.type === 'key' && x.valueRef"
              variant="outline"
              size="sm"
              @click="openKeyChanger(x.label, x.valueRef)"
            >
              {{ getKeyName(unwrap(x.valueRef)) }}
            </Button>

            <div v-else-if="x.type === 'table'" class="w-full">
              <Table>
                <TableHeader v-if="x.columns && x.columns.length">
                  <TableRow>
                    <TableHead
                      v-for="col in x.columns"
                      :key="col.key"
                      class="text-xs"
                    >
                      {{ col.title }}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody v-if="x.data && x.columns">
                  <TableRow v-for="(row, ridx) in x.data" :key="ridx">
                    <TableCell
                      v-for="col in x.columns"
                      :key="col.key"
                      class="text-xs"
                    >
                      <component
                        :is="col.render ? col.render(row) : row[col.key]"
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
