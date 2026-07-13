<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import {
  ChevronRight,
  ChevronDown,
  ExternalLink
} from "@lucide/vue";
import * as LucideIcons from "@lucide/vue";
import type { Component } from "vue";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getMenuItems, getExternalLinks, type MenuItem } from "@/routers/menu";

const route = useRoute();
const props = defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ "update:collapsed": [boolean] }>();

const items = computed(() => getMenuItems());
const externals = computed(() => getExternalLinks());

// Auto-open the group containing the current route.
const initialOpenLabel = (() => {
  for (const it of items.value) {
    if (it !== "-" && it.children) {
      if (it.children.some(c => c !== "-" && route.path.startsWith(c.route))) {
        return it.label;
      }
    }
  }
  return "";
})();
const openGroups = ref<Set<string>>(
  new Set(initialOpenLabel ? [initialOpenLabel] : [])
);

const resolveIcon = (name: string): Component => {
  // Lucide exports PascalCase components (e.g. Gamepad2). Menu stores kebab-case.
  const pascal = name
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return (
    (LucideIcons as unknown as Record<string, Component>)[pascal] ??
    LucideIcons.CircleIcon
  );
};

const toggleGroup = (label: string) => {
  const next = new Set(openGroups.value);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  openGroups.value = next;
};

const isActive = (it: Extract<MenuItem, { route: string }>) =>
  route.path === it.route || route.path.startsWith(it.route + "/");

const openExternal = (url: string) => {
  // Tauri shell plugin opens URLs in the user's default browser.
  import("@tauri-apps/plugin-shell").then(m => m.open(url));
};

const toggleCollapsed = () => emit("update:collapsed", !props.collapsed);
</script>

<template>
  <aside
    :class="
      cn(
        'flex flex-col border-r bg-background transition-[width] duration-150',
        collapsed ? 'w-[52px]' : 'w-[180px]'
      )
    "
  >
    <nav class="flex-1 overflow-y-auto px-2 py-3">
      <template v-for="(item, idx) in items" :key="idx">
        <div v-if="item === '-'" class="my-2 mx-2 border-t" />
        <template v-else-if="item.view">
          <router-link
            :to="item.route"
            :class="
              cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive(item)
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-foreground',
                collapsed && 'justify-center'
              )
            "
            :title="collapsed ? item.label : undefined"
          >
            <component :is="resolveIcon(item.icon)" class="size-4 shrink-0" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </router-link>
        </template>
        <Collapsible
          v-else-if="item.children"
          :open="openGroups.has(item.label)"
          @update:open="toggleGroup(item.label)"
        >
          <CollapsibleTrigger as-child>
            <button
              type="button"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  'hover:bg-accent hover:text-accent-foreground text-foreground',
                  collapsed && 'justify-center'
                )
              "
              :title="collapsed ? item.label : undefined"
            >
              <component
                :is="resolveIcon(item.icon)"
                class="size-4 shrink-0"
              />
              <span v-if="!collapsed" class="flex-1 text-left">
                {{ item.label }}
              </span>
              <ChevronDown
                v-if="!collapsed"
                class="size-4 opacity-60"
                :class="openGroups.has(item.label) ? '' : '-rotate-90'"
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent v-if="!collapsed">
            <template v-for="(child, cidx) in item.children">
              <div
                v-if="child === '-'"
                :key="`sep-${cidx}`"
                class="my-1 mx-2 border-t"
              />
              <router-link
                v-else
                :key="child.route"
                :to="child.route"
                :class="
                  cn(
                    'ml-6 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive(child)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground'
                  )
                "
              >
                <component
                  :is="resolveIcon(child.icon)"
                  class="size-4 shrink-0"
                />
                {{ child.label }}
              </router-link>
            </template>
          </CollapsibleContent>
        </Collapsible>
      </template>
    </nav>

    <div v-if="!collapsed" class="border-t px-2 py-2">
      <button
        v-for="link in externals"
        :key="link.url"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        @click="openExternal(link.url)"
      >
        <component :is="resolveIcon(link.icon)" class="size-4 shrink-0" />
        <span class="flex-1 text-left">{{ link.label }}</span>
        <ExternalLink class="size-3 opacity-60" />
      </button>
    </div>

    <div class="border-t p-2">
      <Button
        variant="ghost"
        size="icon"
        class="w-full"
        @click="toggleCollapsed"
      >
        <ChevronRight
          class="size-4 transition-transform"
          :class="collapsed ? '' : 'rotate-180'"
        />
      </Button>
    </div>
  </aside>
</template>
