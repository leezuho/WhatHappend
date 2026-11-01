"use client";

import { locales, type Locale } from "@/lib/i18n";
import clsx from "clsx";

export function LangSwitch({ current, label }: { current: Locale; label: string }) {
  return (
    <div className="flex rounded-md border border-line p-0.5 text-xs" role="group" aria-label={label}>
      {locales.map((l) => (
        <a
          key={l}
          href={`/${l}`}
          onClick={() => {
            document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          aria-current={l === current ? "true" : undefined}
          className={clsx(
            "rounded px-2 py-1 font-medium uppercase",
            l === current ? "bg-accent text-on-accent" : "text-ink-2 hover:bg-surface-2",
          )}
        >
          {l}
        </a>
      ))}
    </div>
  );
}
