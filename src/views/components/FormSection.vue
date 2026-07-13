<script setup lang="ts">
import type { Component } from "vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

defineProps<{
  title: string;
  icon?: Component;
  description?: string;
  badge?: string;
}>();
</script>

<template>
  <Card
    :id="$attrs.id"
    class="scroll-mt-4"
  >
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <component :is="icon" v-if="icon" class="size-4 text-muted-foreground" />
        {{ title }}
        <Badge
          v-if="badge"
          variant="secondary"
          class="text-xs"
        >
          {{ badge }}
        </Badge>
      </CardTitle>
      <CardDescription v-if="description">
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <slot />
    </CardContent>
  </Card>
</template>
