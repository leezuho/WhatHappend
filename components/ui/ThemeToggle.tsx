"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { THEMES, useThemeName, type ThemeName } from "@/lib/use-theme";

const ICON: Record<ThemeName, ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  anthropic: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" />,
};

/** Segmented light / dark / Anthropic switch; the choice is remembered in localStorage. */
export function ThemeToggle({ labels }: { labels: Record<ThemeName, string> & { group: string } }) {
  const current = useThemeName();
  return (
    <div className="flex rounded-md border border-line p-0.5" role="group" aria-label={labels.group}>
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={current === t}
          aria-label={labels[t]}
          title={labels[t]}
          onClick={() => {
            document.documentElement.dataset.theme = t;
            try {
              localStorage.setItem("theme", t);
            } catch {}
          }}
          className={clsx("grid size-7 place-items-center rounded", current === t ? "bg-accent text-on-accent" : "text-ink-2 hover:bg-surface-2")}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICON[t]}
          </svg>
        </button>
      ))}
    </div>
  );
}
