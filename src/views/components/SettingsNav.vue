<script setup lang="ts">
import type { Component } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

defineProps<{
  items: {
    id: string;
    label: string;
    icon?: Component;
    badge?: string;
  }[];
  activeId: string;
}>();

defineEmits<{ select: [id: string] }>();
</script>

<template>
  <nav class="flex flex-col gap-0.5 p-2">
    <Button
      v-for="item in items"
      :key="item.id"
      variant="ghost"
      size="sm"
      :class="cn(
        'h-9 justify-start gap-2 font-normal',
        activeId === item.id && 'bg-secondary font-medium'
      )"
      @click="$emit('select', item.id)"
    >
      <component
        :is="item.icon"
        v-if="item.icon"
        class="size-4 shrink-0"
      />
      <span class="truncate">{{ item.label }}</span>
      <Badge
        v-if="item.badge"
        variant="outline"
        class="ml-auto shrink-0 text-[10px]"
      >
        {{ item.badge }}
      </Badge>
    </Button>
  </nav>
</template>
