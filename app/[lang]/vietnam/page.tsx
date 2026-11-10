import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import { VnBank, VnEconomy, VnGold, VnMarkets, VnNews } from "@/components/panels/VietnamPanels";

export async function generateMetadata({ params }: PageProps<"/[lang]/vietnam">): Promise<Metadata> {
  const { lang } = await params;
  const m = getDict(hasLocale(lang) ? lang : "vi").meta;
  return { title: m.vietnamTitle, description: m.vietnamDescription };
}

export default async function VietnamPage({ params }: PageProps<"/[lang]/vietnam">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const d = getDict(lang);
  const p = d.panels;

  return (
    <>
      <TopBar
        lang={lang}
        section="vietnam"
        regime={
          <Suspense fallback={null}>
            <RegimeBadge lang={lang} />
          </Suspense>
        }
        ticker={
          <Suspense fallback={<div className="h-[29px] border-t border-line" />}>
            <Ticker lang={lang} />
          </Suspense>
        }
      />
      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Row 1: stocks, the dollar at three prices, gold */}
        <Panel lang={lang} title={p.vnMarkets.title} subtitle={p.vnMarkets.subtitle} sources={["vnindex", "yahoo", "vcb", "binance", "sjc"]} className="md:col-span-2 xl:col-span-12">
          <VnMarkets lang={lang} />
        </Panel>

        {/* Row 2: the economy now, and the IMF's view of the next years */}
        <Panel
          lang={lang}
          title={p.vnEconomy.title}
          subtitle={p.vnEconomy.subtitle}
          sources={["worldbank", "imfcpi", "sbv", "imf"]}
          className="md:col-span-2 xl:col-span-12"
          actions={
            <Link href={`/${lang}/macro`} className="text-xs text-ink-2 hover:text-ink hover:underline">
              {d.vn.compare}
            </Link>
          }
        >
          <VnEconomy lang={lang} />
        </Panel>

        {/* Row 3: gold, bank rates, news */}
        <Panel lang={lang} title={p.vnGold.title} subtitle={p.vnGold.subtitle} sources={["sjc", "yahoo"]} className="xl:col-span-4">
          <VnGold lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.vnBank.title} subtitle={p.vnBank.subtitle} sources={["vcb"]} className="xl:col-span-4">
          <VnBank lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.vnNews.title} subtitle={p.vnNews.subtitle} sources={["rss", "translate"]} className="md:col-span-2 xl:col-span-4">
          <VnNews lang={lang} />
        </Panel>
      </main>
      <AutoRefresh />
    </>
  );
}
