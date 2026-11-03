import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import { CryptoNewsBody, CryptoOddsBody, CryptoVitals, DerivsBody, NetworkBody, TopCoinsBody, TrendingCoinsBody } from "@/components/panels/CryptoPanels";

export async function generateMetadata({ params }: PageProps<"/[lang]/crypto">): Promise<Metadata> {
  const { lang } = await params;
  const m = getDict(hasLocale(lang) ? lang : "vi").meta;
  return { title: m.cryptoTitle, description: m.cryptoDescription };
}

export default async function CryptoPage({ params }: PageProps<"/[lang]/crypto">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const p = getDict(lang).panels;

  return (
    <>
      <TopBar
        lang={lang}
        section="crypto"
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
        {/* Row 1: the numbers to check first */}
        <Panel
          lang={lang}
          title={p.cryptoVitals.title}
          subtitle={p.cryptoVitals.subtitle}
          sources={["yahoo", "coingecko", "fng", "deribit", "defillama", "binance"]}
          className="md:col-span-2 xl:col-span-12"
        >
          <CryptoVitals lang={lang} />
        </Panel>

        {/* Row 2: the market, then leverage and local demand */}
        <Panel lang={lang} title={p.cryptoTop.title} subtitle={p.cryptoTop.subtitle} sources={["coingecko"]} className="md:col-span-2 xl:col-span-8">
          <TopCoinsBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.cryptoDerivs.title} subtitle={p.cryptoDerivs.subtitle} sources={["binance", "vcb"]} className="md:col-span-2 xl:col-span-4">
          <DerivsBody lang={lang} />
        </Panel>

        {/* Row 3: chain, attention, odds */}
        <Panel lang={lang} title={p.cryptoNetwork.title} subtitle={p.cryptoNetwork.subtitle} sources={["mempool"]} className="xl:col-span-4">
          <NetworkBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.cryptoTrending.title} subtitle={p.cryptoTrending.subtitle} sources={["coingecko"]} className="xl:col-span-4">
          <TrendingCoinsBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.cryptoOdds.title} subtitle={p.cryptoOdds.subtitle} sources={["polymarket"]} className="md:col-span-2 xl:col-span-4">
          <CryptoOddsBody lang={lang} />
        </Panel>

        {/* Row 4: news */}
        <Panel lang={lang} title={p.cryptoNews.title} subtitle={p.cryptoNews.subtitle} sources={["rss", "translate"]} className="md:col-span-2 xl:col-span-12">
          <CryptoNewsBody lang={lang} />
        </Panel>
      </main>
      <AutoRefresh />
    </>
  );
}
