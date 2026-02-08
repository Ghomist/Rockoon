import { usePrefStore } from "@/stores/pref";
import { createI18n } from "vue-i18n";

// load all json files in ./languages
const messages: Record<string, any> = {};
const modules: Record<string, any> = import.meta.glob("./languages/*.json", {
  eager: true
});
for (const path in modules) {
  // extract language code from path, e.g. "./languages/en.json" -> "en"
  const lang = path.match(/([\w-]+)\.json$/)![1];
  messages[lang] = modules[path].default || modules[path];
}

/** Detect system locale */
export function detectSystemLanguage() {
  const browserLang = navigator.language.toLowerCase();
  const matched = Object.keys(messages).find(lang =>
    browserLang.includes(lang)
  );
  return matched || "en";
}

/** Switch locale */
export function switchLanguage(lang: string) {
  i18n.global.locale = lang;
  usePrefStore().language = lang;
}

/** Create i18n instance */
export const i18n = createI18n({
  globalInjection: true,
  locale: detectSystemLanguage(),
  fallbackLocale: "en",
  messages
});

/** Global t function */
export const t = i18n.global.t;
