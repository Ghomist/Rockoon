<script setup lang="ts">
import {
  InfoIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  type LucideIcon
} from "@lucide/vue";
import { computed } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { dialogApi, type DialogVariant } from "@/utils/ui/dialog-store";

const iconFor = (v: DialogVariant): LucideIcon | undefined => {
  switch (v) {
    case "info":
      return InfoIcon;
    case "success":
      return CircleCheckIcon;
    case "warning":
      return TriangleAlertIcon;
    case "error":
      return OctagonXIcon;
    default:
      return undefined;
  }
};

const accentClass = (v: DialogVariant): string => {
  switch (v) {
    case "info":
      return "text-blue-500";
    case "success":
      return "text-emerald-500";
    case "warning":
      return "text-amber-500";
    case "error":
      return "text-destructive";
    default:
      return "";
  }
};

const dialogs = computed(() => dialogApi.list.value);
</script>

<template>
  <Dialog
    v-for="d in dialogs"
    :key="d.id"
    :open="true"
    @update:open="(v: boolean) => !v && dialogApi.dismiss(d.id)"
  >
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component
            :is="iconFor(d.variant)"
            v-if="iconFor(d.variant)"
            :class="['size-5', accentClass(d.variant)]"
          />
          {{ d.title }}
        </DialogTitle>
        <DialogDescription v-if="typeof d.content !== 'function'">
          {{ d.content }}
        </DialogDescription>
      </DialogHeader>

      <!--
        Functional content (e.g. inputs). Treated as a render function so
        reactive reads inside it re-render correctly.
      -->
      <component
        v-if="typeof d.content === 'function'"
        :is="d.content"
        class="text-sm text-muted-foreground"
      />

      <DialogFooter>
        <Button
          v-if="d.negativeText"
          variant="outline"
          @click="dialogApi.cancel(d.id)"
        >
          {{ d.negativeText }}
        </Button>
        <Button @click="dialogApi.confirm(d.id)">
          {{ d.positiveText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
