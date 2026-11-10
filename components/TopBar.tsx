import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { getDict, type Locale } from "@/lib/i18n";
import { MarketClocks } from "@/components/ui/MarketClocks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LangSwitch } from "@/components/ui/LangSwitch";

export type Section = "overview" | "macro" | "vietnam" | "crypto" | "tech";

export function TopBar({ lang, section, regime, ticker }: { lang: Locale; section: Section; regime?: ReactNode; ticker?: ReactNode }) {
  const t = getDict(lang).topbar;
  const links: { key: Section; href: string; label: string }[] = [
    { key: "overview", href: `/${lang}`, label: t.navOverview },
    { key: "macro", href: `/${lang}/macro`, label: t.navMacro },
    { key: "vietnam", href: `/${lang}/vietnam`, label: t.navVietnam },
    { key: "crypto", href: `/${lang}/crypto`, label: t.navCrypto },
    { key: "tech", href: `/${lang}/tech`, label: t.navTech },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <Link href={`/${lang}`} className="font-display text-base font-semibold tracking-tight text-ink">
            WhatHappend
          </Link>
          <span className="hidden text-xs text-muted 2xl:inline">{t.tagline}</span>
        </div>
        {/* Five tabs just fit a phone; labels never break, and the row scrolls rather than wrap if a label grows. */}
        <nav aria-label={t.nav} className="scroll-thin flex max-w-full gap-1 overflow-x-auto text-xs">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={l.key === section ? "page" : undefined}
              className={clsx(
                "shrink-0 rounded-md px-2 py-1 font-medium whitespace-nowrap transition-colors",
                l.key === section ? "bg-accent text-on-accent shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <MarketClocks labels={{ open: t.open, closed: t.closed, break: t.break }} />
        <div className="ml-auto flex items-center gap-2">
          {regime}
          <LangSwitch current={lang} label={t.switchLang} path={section === "overview" ? "" : section} />
          <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark, anthropic: t.themeAnthropic, group: t.themeGroup }} />
        </div>
      </div>
      {ticker}
    </header>
  );
}
