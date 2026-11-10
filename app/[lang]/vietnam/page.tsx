import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import { Vn30Map, VnBank, VnEconomy, VnForeign, VnFuel, VnGold, VnHazards, VnMarkets, VnNews, VnRates, VnRegion } from "@/components/panels/VietnamPanels";
import { CalendarBody } from "@/components/panels/WorldPanels";

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
        <Panel lang={lang} title={p.vnMarkets.title} subtitle={p.vnMarkets.subtitle} sources={["vnindex", "vnstocks", "yahoo", "vcb", "binance", "sjc"]} className="md:col-span-2 xl:col-span-12">
          <VnMarkets lang={lang} />
        </Panel>

        {/* Row 1b: inside the stock market: the VN30 by size, and what foreigners are doing */}
        <Panel lang={lang} title={p.vn30.title} subtitle={p.vn30.subtitle} sources={["vnstocks"]} className="md:col-span-2 xl:col-span-8">
          <Vn30Map lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.vnForeign.title} subtitle={p.vnForeign.subtitle} sources={["vnflows"]} className="md:col-span-2 xl:col-span-4">
          <VnForeign lang={lang} />
        </Panel>

        {/* Row 2: the economy now, and the IMF's view of the next years */}
        <Panel
          lang={lang}
          title={p.vnEconomy.title}
          subtitle={p.vnEconomy.subtitle}
          sources={["worldbank", "imfcpi", "sbv", "ibrate", "imf"]}
          className="md:col-span-2 xl:col-span-12"
          actions={
            <Link href={`/${lang}/macro`} className="text-xs text-ink-2 hover:text-ink hover:underline">
              {d.vn.compare}
            </Link>
          }
        >
          <VnEconomy lang={lang} />
        </Panel>

        {/* Row 2b: the economy over time, the market against its neighbours */}
        <Panel lang={lang} title={p.vnRates.title} subtitle={p.vnRates.subtitle} sources={["imfcpi", "sbv"]} className="xl:col-span-7">
          <VnRates lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.vnRegion.title} subtitle={p.vnRegion.subtitle} sources={["yahoo", "vnindex"]} className="xl:col-span-5">
          <VnRegion lang={lang} />
        </Panel>

        {/* Row 3: gold and the dollar, today and day by day */}
        <Panel lang={lang} title={p.vnGold.title} subtitle={p.vnGold.subtitle} sources={["sjc", "yahoo"]} className="md:col-span-2 xl:col-span-6">
          <VnGold lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.vnBank.title} subtitle={p.vnBank.subtitle} sources={["vcb", "yahoo", "binance", "sbvrate"]} className="md:col-span-2 xl:col-span-6">
          <VnBank lang={lang} />
        </Panel>

        {/* Row 4: news + what is coming, laid out like the overview's; fuel prices and hazards under the calendar */}
        <Panel lang={lang} title={p.vnNews.title} subtitle={p.vnNews.subtitle} sources={["rss", "translate"]} className="md:col-span-2 xl:col-span-8">
          <VnNews lang={lang} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-4 md:col-span-2 xl:col-span-4">
          <Panel lang={lang} title={p.vnCalendar.title} subtitle={p.vnCalendar.subtitle} sources={["calendar"]}>
            <CalendarBody lang={lang} days={45} kinds={["vn", "fomc"]} />
          </Panel>
          <Panel lang={lang} title={p.vnFuel.title} subtitle={p.vnFuel.subtitle} sources={["petrolimex"]}>
            <VnFuel lang={lang} />
          </Panel>
          <Panel lang={lang} title={p.vnHazards.title} subtitle={p.vnHazards.subtitle} sources={["gdacs", "eonet", "usgs"]} className="flex-1">
            <VnHazards lang={lang} />
          </Panel>
        </div>
      </main>
      <AutoRefresh />
    </>
  );
}
