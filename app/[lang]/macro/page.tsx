import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, hasLocale } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { Panel } from "@/components/ui/Panel";
import { RegimeBadge, Ticker } from "@/components/panels/MarketPanels";
import {
  CycleClockPanel,
  DebtPanel,
  GrowthPanel,
  InflationPanel,
  JobsPanel,
  MacroNoteBody,
  WorldMapPanel,
  MoneyPanel,
  RecessionPanel,
  ScorecardPanel,
  WorldPulse,
} from "@/components/panels/MacroPanels";
import { CalendarBody } from "@/components/panels/WorldPanels";

export async function generateMetadata({ params }: PageProps<"/[lang]/macro">): Promise<Metadata> {
  const { lang } = await params;
  const m = getDict(hasLocale(lang) ? lang : "vi").meta;
  return { title: m.macroTitle, description: m.macroDescription };
}

export default async function MacroPage({ params }: PageProps<"/[lang]/macro">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const p = getDict(lang).panels;

  return (
    <>
      <TopBar
        lang={lang}
        section="macro"
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
        {/* Row 1: the world in eight numbers */}
        <Panel lang={lang} title={p.worldPulse.title} subtitle={p.worldPulse.subtitle} sources={["imf", "fred", "gscpi"]} className="md:col-span-2 xl:col-span-12">
          <WorldPulse lang={lang} />
        </Panel>

        {/* Row 2: the week in words (AI, once a week, from this page's numbers) */}
        <Panel lang={lang} title={p.macroNote.title} subtitle={p.macroNote.subtitle} sources={["macronote"]} className="md:col-span-2 xl:col-span-12">
          <MacroNoteBody lang={lang} />
        </Panel>

        {/* Row 3: every economy's health on one table */}
        <Panel lang={lang} title={p.scorecard.title} subtitle={p.scorecard.subtitle} sources={["oecd", "imfcpi", "imf", "bis", "sbv", "worldbank", "cnbc", "yahoo", "fred"]} className="md:col-span-2 xl:col-span-12">
          <ScorecardPanel lang={lang} />
        </Panel>

        {/* Row 4: where each economy is in its cycle */}
        <Panel lang={lang} title={p.cycleClock.title} subtitle={p.cycleClock.subtitle} sources={["oecd"]} className="md:col-span-2 xl:col-span-12">
          <CycleClockPanel lang={lang} />
        </Panel>

        {/* Row 5: the whole world, not only the 16 economies above */}
        <Panel lang={lang} title={p.worldMap.title} subtitle={p.worldMap.subtitle} sources={["imf"]} className="md:col-span-2 xl:col-span-12">
          <WorldMapPanel lang={lang} />
        </Panel>

        {/* Rows 6–10: one question per panel, the US in detail beside the major economies */}
        <Panel lang={lang} title={p.growth.title} subtitle={p.growth.subtitle} sources={["oecd", "fred"]} className="md:col-span-2 xl:col-span-12">
          <GrowthPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.inflation.title} subtitle={p.inflation.subtitle} sources={["oecd", "imfcpi", "fred"]} className="md:col-span-2 xl:col-span-12">
          <InflationPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.money.title} subtitle={p.money.subtitle} sources={["bis", "sbv", "oecd", "imfcpi", "fred"]} className="md:col-span-2 xl:col-span-12">
          <MoneyPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.jobs.title} subtitle={p.jobs.subtitle} sources={["oecd", "fred"]} className="md:col-span-2 xl:col-span-12">
          <JobsPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.debt.title} subtitle={p.debt.subtitle} sources={["imf", "bis", "fred"]} className="md:col-span-2 xl:col-span-12">
          <DebtPanel lang={lang} />
        </Panel>

        {/* Row 11: how close a recession is, and what is coming */}
        <Panel lang={lang} title={p.recession.title} subtitle={p.recession.subtitle} sources={["fred", "oecd"]} className="md:col-span-2 xl:col-span-7">
          <RecessionPanel lang={lang} />
        </Panel>
        <Panel lang={lang} title={p.macroCalendar.title} subtitle={p.macroCalendar.subtitle} sources={["calendar"]} className="md:col-span-2 xl:col-span-5">
          <CalendarBody lang={lang} days={28} kinds={["econ", "fomc", "cb"]} />
        </Panel>
      </main>
      <AutoRefresh />
    </>
  );
}
