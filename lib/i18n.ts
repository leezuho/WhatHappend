import en from "@/messages/en.json";
import viJson from "@/messages/vi.json";

export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];
export type Dict = typeof en;

// Typing vi against en's shape makes a missing key a compile error.
const vi: Dict = viJson;
const dicts: Record<Locale, Dict> = { en, vi };

export const defaultLocale: Locale = "vi";

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDict(locale: Locale): Dict {
  return dicts[locale];
}

/** A value with both languages, e.g. series names defined in config. */
export type Bi = { en: string; vi: string };

export function pick(text: Bi, locale: Locale): string {
  return text[locale];
}

export function intlLocale(locale: Locale): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}
