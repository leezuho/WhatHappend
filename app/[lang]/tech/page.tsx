import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import { AiResearch, ExploitedVulns, NewModels, StatusBoard, TechHn, TechMarkets, TechNewsBody } from "@/components/panels/TechPanels";

export async function generateMetadata({ params }: PageProps<"/[lang]/tech">): Promise<Metadata> {
  const { lang } = await params;
  const m = getDict(hasLocale(lang) ? lang : "vi").meta;
  return { title: m.techTitle, description: m.techDescription };
}

export default async function TechPage({ params }: PageProps<"/[lang]/tech">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const p = getDict(lang).panels;

  return (
    <>
      <TopBar
        lang={lang}
        section="tech"
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
        {/* Row 1: the market; beside it, whether the services everything runs on are up, then what developers read
            (Hacker News fills whatever height the stock table leaves) */}
        <Panel lang={lang} title={p.techMarkets.title} subtitle={p.techMarkets.subtitle} sources={["yahoo"]} className="md:col-span-2 xl:col-span-8">
          <TechMarkets lang={lang} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-4 md:col-span-2 xl:col-span-4">
          <Panel lang={lang} title={p.techStatus.title} subtitle={p.techStatus.subtitle} sources={["cloudstatus"]}>
            <StatusBoard lang={lang} />
          </Panel>
          <Panel lang={lang} title={p.techHn.title} subtitle={p.techHn.subtitle} sources={["hackernews"]} className="flex-1">
            <TechHn lang={lang} />
          </Panel>
        </div>

        {/* Row 2: AI, what ships and what researchers read */}
        <Panel lang={lang} title={p.techModels.title} subtitle={p.techModels.subtitle} sources={["openrouter"]} className="md:col-span-2 xl:col-span-7">
          <NewModels lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techResearch.title} subtitle={p.techResearch.subtitle} sources={["huggingface", "translate"]} className="md:col-span-2 xl:col-span-5">
          <AiResearch lang={lang} />
        </Panel>

        {/* Row 3: security (two columns from md) */}
        <Panel lang={lang} title={p.techSecurity.title} subtitle={p.techSecurity.subtitle} sources={["kev"]} className="md:col-span-2 xl:col-span-12">
          <ExploitedVulns lang={lang} />
        </Panel>

        {/* Row 4: news */}
        <Panel lang={lang} title={p.techNews.title} subtitle={p.techNews.subtitle} sources={["rss", "translate"]} className="md:col-span-2 xl:col-span-12">
          <TechNewsBody lang={lang} />
        </Panel>
      </main>
      <AutoRefresh />
    </>
  );
}
