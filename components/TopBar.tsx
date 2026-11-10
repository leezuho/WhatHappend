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
    <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Link href={`/${lang}`} className="flex items-center gap-2 text-ink">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent shadow-card">
              {/* A globe: rim, one meridian, the equator. */}
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" />
                <ellipse cx="12" cy="12" rx="3.6" ry="8.5" />
                <path d="M3.5 12h17" />
              </svg>
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight">WhatHappend</span>
          </Link>
          <span className="hidden text-xs text-muted 2xl:inline">{t.tagline}</span>
        </div>
        {/* Five tabs just fit a phone; labels never break, and the row scrolls rather than wrap if a label grows. */}
        <nav aria-label={t.nav} className="scroll-thin flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface p-0.5 text-xs shadow-card ring-1 ring-line sm:text-[13px]">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={l.key === section ? "page" : undefined}
              className={clsx(
                "grid h-7 shrink-0 place-items-center rounded-md px-2 font-medium whitespace-nowrap transition-colors sm:px-2.5",
                l.key === section ? "bg-accent text-on-accent shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {/* Below 1440px the clocks take their own row, so the controls stay beside the tabs. */}
        <div className="order-last w-full min-[1440px]:order-none min-[1440px]:w-auto">
          <MarketClocks labels={{ open: t.open, closed: t.closed, break: t.break }} />
        </div>
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
