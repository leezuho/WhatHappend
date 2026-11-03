import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { getDict, type Locale } from "@/lib/i18n";
import { MarketClocks } from "@/components/ui/MarketClocks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LangSwitch } from "@/components/ui/LangSwitch";

export type Section = "overview" | "crypto";

export function TopBar({ lang, section, regime, ticker }: { lang: Locale; section: Section; regime?: ReactNode; ticker?: ReactNode }) {
  const t = getDict(lang).topbar;
  const links: { key: Section; href: string; label: string }[] = [
    { key: "overview", href: `/${lang}`, label: t.navOverview },
    { key: "crypto", href: `/${lang}/crypto`, label: t.navCrypto },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <Link href={`/${lang}`} className="font-display text-base font-semibold tracking-tight text-ink">
            WhatHappend
          </Link>
          <span className="hidden text-xs text-muted xl:inline">{t.tagline}</span>
        </div>
        <nav aria-label={t.nav} className="flex gap-1 text-xs">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={l.key === section ? "page" : undefined}
              className={clsx("rounded-md px-2 py-1 font-medium", l.key === section ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <MarketClocks labels={{ open: t.open, closed: t.closed, break: t.break }} />
        <div className="ml-auto flex items-center gap-2">
          {regime}
          <LangSwitch current={lang} label={t.language} path={section === "overview" ? "" : section} />
          <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark, anthropic: t.themeAnthropic, group: t.themeGroup }} />
        </div>
      </div>
      {ticker}
    </header>
  );
}
