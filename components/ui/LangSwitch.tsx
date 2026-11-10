"use client";

import { locales, type Locale } from "@/lib/i18n";

/**
 * One link that shows the current language and goes to the other one.
 * `path` is the current page below the language segment ("" or "crypto"), kept when switching.
 */
export function LangSwitch({ current, label, path = "" }: { current: Locale; label: string; path?: string }) {
  const other = locales.find((l) => l !== current) ?? current;
  return (
    <a
      href={path ? `/${other}/${path}` : `/${other}`}
      hrefLang={other}
      onClick={() => {
        document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`;
      }}
      aria-label={label}
      title={label}
      className="grid h-8 min-w-8 place-items-center rounded-lg border border-line bg-surface px-2 text-xs font-semibold uppercase text-ink-2 shadow-card transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {current}
    </a>
  );
}
