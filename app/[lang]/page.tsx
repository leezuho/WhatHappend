import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import {
  AssetClasses,
  Commodities,
  EconomyPulse,
  InflationRatesPanel,
  RegimeBadge,
  StressPanel,
  Ticker,
  VitalSigns,
  WorldMarkets,
  YieldCurvePanel,
} from "@/components/panels/MarketPanels";
import { MapBody, NewsTabs, VietnamBody } from "@/components/panels/ContentPanels";
import { CalendarBody, EnvBody, PredictionBody, TrendingBody } from "@/components/panels/WorldPanels";
import { ThemesBody } from "@/components/panels/ThemePanels";
import { WhatsNewBody } from "@/components/panels/WhatsNew";
import { ChokepointsBody, GprCountriesBody, UsPolicyBody } from "@/components/panels/GeoPanels";
import { CotBody } from "@/components/panels/CotPanel";

export default async function DashboardPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const d = getDict(lang);
  const p = d.panels;

  return (
    <>
      <TopBar
        lang={lang}
        section="overview"
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
        {/* Row 0: what changed since the reader last looked, then the few stories driving markets */}
        <Panel lang={lang} title={p.whatsNew.title} subtitle={p.whatsNew.subtitle} sources={["changes"]} className="md:col-span-2 xl:col-span-12">
          <WhatsNewBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.themes.title} subtitle={p.themes.subtitle} sources={["themes", "yahoo", "fred", "rss"]} className="md:col-span-2 xl:col-span-12">
          <ThemesBody lang={lang} />
        </Panel>

        {/* Row 1: the news (the AI brief, the latest headlines a tab away), beside what is on the calendar today and the next weeks */}
        <Panel lang={lang} title={p.news.title} subtitle={p.news.subtitle} sources={["brief", "rss", "translate"]} className="md:col-span-2 xl:col-span-8">
          <NewsTabs lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.calendar.title} subtitle={p.calendar.subtitle} sources={["calendar", "releases", "launches"]} className="md:col-span-2 xl:col-span-4">
          <CalendarBody lang={lang} />
        </Panel>

        {/* Row 2: vital signs, with the indicators that stand out today (reasons and one AI line on the tile) */}
        <Panel id="vitals" lang={lang} title={p.vitals.title} subtitle={p.vitals.subtitle} sources={["yahoo", "fred", "vnindex", "insights"]} className="md:col-span-2 xl:col-span-12">
          <VitalSigns lang={lang} />
        </Panel>

        {/* Row 3b: every major stock market, not only Wall Street */}
        <Panel lang={lang} title={p.worldMarkets.title} subtitle={p.worldMarkets.subtitle} sources={["yahoo", "vnindex"]} className="md:col-span-2 xl:col-span-12">
          <WorldMarkets lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.commodities.title} subtitle={p.commodities.subtitle} sources={["yahoo"]} className="xl:col-span-7">
          <Commodities lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.assetClasses.title} subtitle={p.assetClasses.subtitle} sources={["yahoo", "vnindex"]} className="xl:col-span-5">
          <AssetClasses lang={lang} />
        </Panel>

        {/* Row 3c: how speculators are placed in futures, against their own last three years */}
        <Panel lang={lang} title={p.cot.title} subtitle={p.cot.subtitle} sources={["cot"]} className="md:col-span-2 xl:col-span-12">
          <CotBody lang={lang} />
        </Panel>

        {/* Row 4: context */}
        <Panel lang={lang} title={p.yieldCurve.title} subtitle={p.yieldCurve.subtitle} sources={["fred"]} className="xl:col-span-6">
          <YieldCurvePanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.inflationRates.title} subtitle={p.inflationRates.subtitle} sources={["imf", "bis", "sbv"]} className="xl:col-span-6">
          <InflationRatesPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.stress.title} subtitle={p.stress.subtitle} sources={["yahoo", "fred", "gpr"]} className="xl:col-span-6">
          <StressPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.economy.title} subtitle={p.economy.subtitle} sources={["fred", "gscpi"]} className="xl:col-span-6">
          <EconomyPulse lang={lang} />
        </Panel>

        {/* Row 6: the world at a glance (below the morning read) */}
        <Panel lang={lang} title={p.map.title} subtitle={p.map.subtitle} sources={["usgs", "gdacs", "eonet", "gdelt"]} className="md:col-span-2 xl:col-span-12">
          <MapBody lang={lang} />
        </Panel>

        {/* Row 6b: the geopolitical layer under the map: shipping lanes, risk by country, Washington's actions, what prediction markets bet on */}
        <Panel lang={lang} title={p.chokepoints.title} subtitle={p.chokepoints.subtitle} sources={["portwatch"]} className="md:col-span-2 xl:col-span-6">
          <ChokepointsBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.gprCountries.title} subtitle={p.gprCountries.subtitle} sources={["gprc"]} className="md:col-span-2 xl:col-span-6">
          <GprCountriesBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.usPolicy.title} subtitle={p.usPolicy.subtitle} sources={["uspolicy"]} className="xl:col-span-6">
          <UsPolicyBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.prediction.title} subtitle={p.prediction.subtitle} sources={["polymarket", "kalshi"]} className="xl:col-span-6">
          <PredictionBody lang={lang} />
        </Panel>

        {/* Row 7: attention and the planet */}
        <Panel lang={lang} title={p.trending.title} subtitle={p.trending.subtitle} sources={["wikipedia", "hackernews"]} className="xl:col-span-6">
          <TrendingBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.env.title} subtitle={p.env.subtitle} sources={["co2", "gistemp", "airquality", "who"]} className="xl:col-span-6">
          <EnvBody lang={lang} />
        </Panel>

        {/* Row 8: Vietnam */}
        <Panel
          lang={lang}
          title={p.vietnam.title}
          subtitle={p.vietnam.subtitle}
          sources={["vnindex", "sjc", "vcb"]}
          className="md:col-span-2 xl:col-span-12"
          actions={
            <Link href={`/${lang}/vietnam`} className="text-xs text-ink-2 hover:text-ink hover:underline">
              {d.vn.more}
            </Link>
          }
        >
          <VietnamBody lang={lang} />
        </Panel>
      </main>
      <AutoRefresh />
    </>
  );
}
