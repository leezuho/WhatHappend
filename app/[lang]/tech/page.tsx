import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import {
  AiResearch,
  AiValueBody,
  ComputeBody,
  EolBody,
  ExploitedVulns,
  KevVendorsBody,
  NewModels,
  PackagesBody,
  SpaceBody,
  StatusBoard,
  TechHn,
  TechJobsBody,
  TechMarkets,
  TechNewsBody,
  TechNoteBody,
  TwRevenueBody,
} from "@/components/panels/TechPanels";

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
          <Panel lang={lang} title={p.techHn.title} subtitle={p.techHn.subtitle} sources={["hackernews", "lobsters"]} className="flex-1">
            <TechHn lang={lang} />
          </Panel>
        </div>

        {/* Row 1b: the week in words (AI, once a week, from this page's stories and numbers) */}
        <Panel lang={lang} title={p.techNote.title} subtitle={p.techNote.subtitle} sources={["technote"]} className="md:col-span-2 xl:col-span-12">
          <TechNoteBody lang={lang} />
        </Panel>

        {/* Row 2: AI, what ships and what researchers read */}
        <Panel lang={lang} title={p.techModels.title} subtitle={p.techModels.subtitle} sources={["openrouter"]} className="md:col-span-2 xl:col-span-7">
          <NewModels lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techResearch.title} subtitle={p.techResearch.subtitle} sources={["huggingface", "translate"]} className="md:col-span-2 xl:col-span-5">
          <AiResearch lang={lang} />
        </Panel>

        {/* Row 2a: which models are worth their price, and how big training runs have become */}
        <Panel lang={lang} title={p.techValue.title} subtitle={p.techValue.subtitle} sources={["arena"]} className="md:col-span-2 xl:col-span-8">
          <AiValueBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techCompute.title} subtitle={p.techCompute.subtitle} sources={["epoch"]} className="md:col-span-2 xl:col-span-4">
          <ComputeBody lang={lang} />
        </Panel>

        {/* Row 2b: the cycle behind the headlines: AI hardware sales, hiring */}
        <Panel lang={lang} title={p.techTw.title} subtitle={p.techTw.subtitle} sources={["twse"]} className="md:col-span-2 xl:col-span-7">
          <TwRevenueBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techJobs.title} subtitle={p.techJobs.subtitle} sources={["fred", "hnhiring"]} className="md:col-span-2 xl:col-span-5">
          <TechJobsBody lang={lang} />
        </Panel>

        {/* Row 2c: the tools: what people install, and when support runs out */}
        <Panel lang={lang} title={p.techPkg.title} subtitle={p.techPkg.subtitle} sources={["pkgtrends"]} className="md:col-span-2 xl:col-span-7">
          <PackagesBody lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techEol.title} subtitle={p.techEol.subtitle} sources={["eol"]} className="md:col-span-2 xl:col-span-5">
          <EolBody lang={lang} />
        </Panel>

        {/* Row 3: security, the latest flaws and who they hit */}
        <Panel lang={lang} title={p.techSecurity.title} subtitle={p.techSecurity.subtitle} sources={["kev"]} className="md:col-span-2 xl:col-span-8">
          <ExploitedVulns lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.techKevVendors.title} subtitle={p.techKevVendors.subtitle} sources={["kev"]} className="md:col-span-2 xl:col-span-4">
          <KevVendorsBody lang={lang} />
        </Panel>

        {/* Row 3b: above the clouds: geomagnetic storms, launches */}
        <Panel lang={lang} title={p.techSpace.title} subtitle={p.techSpace.subtitle} sources={["spaceweather", "launches"]} className="md:col-span-2 xl:col-span-12">
          <SpaceBody lang={lang} />
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
