import { create } from "zustand";
import { usePrefStore } from "@/stores/pref";

// Eagerly import all language JSONs (Vite handles this at build time).
const modules = import.meta.glob("./languages/*.json", {
  eager: true
}) as Record<string, { default: Record<string, unknown> }>;

const messages: Record<string, Record<string, unknown>> = {};
for (const path in modules) {
  const lang = path.match(/([\w-]+)\.json$/)![1];
  messages[lang] = modules[path].default || modules[path];
}

type Params = Record<string, string | number>;

const interpolate = (template: string, params?: Params): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
};

/** Resolve a dotted key (e.g. "menu.game") against the message tree. */
const lookup = (lang: string, key: string): string | undefined => {
  const tree = messages[lang] ?? messages.en;
  const fallback = messages.en;
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      // try fallback
      let fb: unknown = fallback;
      for (const fp of parts) {
        if (fb && typeof fb === "object" && fp in fb) {
          fb = (fb as Record<string, unknown>)[fp];
        } else {
          fb = undefined;
          break;
        }
      }
      return typeof fb === "string" ? fb : undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
};

interface I18nState {
  lang: string;
  setLang: (lang: string) => void;
}

export const useI18nStore = create<I18nState>(set => ({
  lang: detectSystemLanguage(),
  setLang: lang => set({ lang })
}));

/**
 * Detect system locale against available languages.
 * Hardcodes the known lang list to avoid referencing the module-level
 * `messages` const during a circular module-eval with stores/pref.ts
 * (which calls this function at its own eval time).
 */
export function detectSystemLanguage(): string {
  const browserLang = navigator.language.toLowerCase();
  // ponytail: hardcoded langs (project only ships en + zh); if a new lang is
  // added to languages/, also append its code here.
  const known = ["en", "zh"];
  return known.find(l => browserLang.includes(l)) || "en";
}

/** Switch locale and persist to pref store. */
export function switchLanguage(lang: string): void {
  useI18nStore.getState().setLang(lang);
  usePrefStore.getState().language = lang;
}

/**
 * Global t function. Reads synchronously from the store's current state.
 * Inside React components, prefer `useT()` so the component subscribes to
 * lang changes. Outside React (services, utils), call `t` directly.
 *
 * Optional `count` enables pluralization: the message string may contain
 * `|`-separated variants (e.g. "No items | 1 item | {cnt} items"); the
 * matching variant is selected by count (0 / 1 / many).
 */
export function t(key: string, params?: Params, count?: number): string {
  const lang = useI18nStore.getState().lang;
  let raw = lookup(lang, key) ?? key;
  if (count !== undefined && raw.includes("|")) {
    const variants = raw.split("|").map(v => v.trim());
    if (count === 0 && variants.length >= 1) raw = variants[0];
    else if (count === 1 && variants.length >= 2) raw = variants[1];
    else if (variants.length >= 3) raw = variants[2];
    else if (variants.length === 2) raw = variants[1];
    else raw = variants[0];
  }
  return interpolate(raw, params);
}

/** React hook: subscribe to lang, return the bound t function. */
export function useT(): (
  key: string,
  params?: Params,
  count?: number
) => string {
  useI18nStore(s => s.lang); // subscribe for re-render
  return t;
}
