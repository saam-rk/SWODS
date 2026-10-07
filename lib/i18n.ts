import en from "@/locales/en.json";
import es from "@/locales/es.json";
import it from "@/locales/it.json";

export const locales = ["en", "es", "it"] as const;
export type Locale = (typeof locales)[number];
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, es, it };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es" || value === "it";
}

export function detectLocale(language: string | null | undefined): Locale {
  const normalized = language?.toLowerCase() ?? "";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("it")) return "it";
  return "en";
}

export function detectLocalePreference(languages: readonly string[] | null | undefined): Locale {
  for (const language of languages ?? []) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("it")) return "it";
    if (normalized.startsWith("en")) return "en";
  }

  return "en";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
}
