import type { ReactNode } from "react";
import { getDict, type Locale } from "@/lib/i18n";
import { MarketClocks } from "@/components/ui/MarketClocks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LangSwitch } from "@/components/ui/LangSwitch";

export function TopBar({ lang, regime, ticker }: { lang: Locale; regime?: ReactNode; ticker?: ReactNode }) {
  const t = getDict(lang).topbar;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-base font-semibold tracking-tight text-ink">WhatHappend</span>
          <span className="hidden text-xs text-muted sm:inline">{t.tagline}</span>
        </div>
        <MarketClocks labels={{ open: t.open, closed: t.closed, break: t.break }} />
        <div className="ml-auto flex items-center gap-2">
          {regime}
          <LangSwitch current={lang} />
          <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark, anthropic: t.themeAnthropic, group: t.themeGroup }} />
        </div>
      </div>
      {ticker}
    </header>
  );
}
