<script setup lang="ts">
import { computed, type Ref } from "vue";
import { cn } from "@/lib/utils";
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  type SliderRootEmits,
  type SliderRootProps
} from "reka-ui";
import { useVModel } from "@vueuse/core";

const props = withDefaults(
  defineProps<SliderRootProps & { class?: string }>(),
  { class: "" }
);
const emits = defineEmits<SliderRootEmits>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: [0]
}) as unknown as Ref<number[]>;

const className = computed(() =>
  cn(
    "relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
    props.class
  )
);
</script>

<template>
  <SliderRoot
    :class="className"
    v-bind="props"
    v-model="modelValue"
  >
    <SliderTrack
      class="relative grow overflow-hidden rounded-full bg-secondary data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
    >
      <SliderRange
        class="absolute h-full bg-primary data-[orientation=vertical]:w-full"
      />
    </SliderTrack>
    <SliderThumb
      v-for="(_, key) in modelValue"
      :key="key"
      class="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
