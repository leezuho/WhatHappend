import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { MACRO_US, WORLD_PULSE, type SeriesDef, type SeriesKey } from "@/config/series";
import { RECESSION_SIGNALS, SCORE_COLS, US_CPI_PARTS, type ScoreColDef } from "@/config/macro";
import { MACRO_COUNTRIES } from "@/config/countries";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtNumber, fmtPeriod, fmtSigned, fmtValue } from "@/lib/format";
import { getInsightNotes, getTiles, getWatchlist } from "@/lib/queries";
import {
  getConfidence,
  getCycleClock,
  getDebtTable,
  getGrowthInflation,
  getMacroNote,
  getWorldMap,
  getOecdLines,
  getPolicyLines,
  getReer,
  getScorecard,
  getUsCpiParts,
  type CountryLine,
  type ConfidenceCell,
  type ScoreCell,
  type ScoreRow,
} from "@/lib/queries-macro";
import type { Status } from "@/lib/signals/macro";
import { alertOf } from "@/lib/signals/notable";
import { CycleClock } from "@/components/charts/CycleClock";
import { QuadrantScatter } from "@/components/charts/QuadrantScatter";
import { WorldChoropleth } from "@/components/charts/WorldChoropleth";
import { SmallMultiples, type MultipleRow } from "@/components/charts/SmallMultiples";
import { Sparkline } from "@/components/charts/Sparkline";
import { LineChart } from "@/components/charts/LineChart";
import { EmptyState } from "@/components/ui/Panel";
import { DetailTile } from "./MarketPanels";
import { WeeklyNote } from "./WeeklyNote";

// Panels of the world-macro page (app/[lang]/macro).

// ---------------------------------------------------------------- weekly AI note

export async function MacroNoteBody({ lang }: { lang: Locale }) {
  const m = getDict(lang).macro;
  const { note, hasKey } = await getMacroNote(lang);
  if (!note) return <p className="py-2 text-sm text-ink-2">{hasKey ? m.noteEmpty : m.noteNeedsKey}</p>;
  return <WeeklyNote note={note} lang={lang} caveat={m.noteCaveat} />;
}

// ---------------------------------------------------------------- world map

export async function WorldMapPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const { year, metrics } = await getWorldMap(lang);
  if (metrics.every((m) => !Object.keys(m.values).length)) return <EmptyState lang={lang} />;
  return (
    <WorldChoropleth
      metrics={metrics}
      year={year}
      locale={lang}
      labels={{ table: d.common.showTable, chart: d.common.showChart, noData: d.macro.mapNoData, country: d.macro.country, hint: d.macro.mapHint }}
    />
  );
}

// ---------------------------------------------------------------- world pulse

export async function WorldPulse({ lang }: { lang: Locale }) {
  const watch = await getWatchlist();
  const notes = await getInsightNotes(lang);
  const tiles = await getTiles(WORLD_PULSE);
  if (tiles.every((t) => !t.data)) return <EmptyState lang={lang} />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
      {tiles.map((t) => (
        <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- business cycle clock

export async function CycleClockPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const rows = await getCycleClock(lang);
  if (!rows.length) return <EmptyState lang={lang} message={d.macro.noClock} />;
  const m = d.macro;
  return (
    <CycleClock
      rows={rows.map((r) => ({
        key: r.short,
        label: r.short,
        name: r.name,
        phase: r.phase,
        trail: r.trail,
      }))}
      locale={lang}
      labels={{
        phases: m.phases,
        phaseHints: m.phaseHints,
        axisGap: m.axisGap,
        axisMomentum: m.axisMomentum,
        trail: m.trail,
        country: m.country,
        phase: m.phase,
        cliLevel: m.cliLevel,
        momentum: m.momentum,
        table: d.common.showTable,
        chart: d.common.showChart,
      }}
    />
  );
}

// ---------------------------------------------------------------- growth vs inflation, debt vs deficit

export async function GrowthInflationPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const points = await getGrowthInflation(lang);
  if (!points.length) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <QuadrantScatter
        points={points.map((p) => ({
          key: p.short,
          label: p.short,
          name: p.name,
          x: p.growthGap,
          y: p.inflationGap,
          trail: p.trail.map((t) => ({ x: t.growthGap, y: t.inflationGap })),
          group: p.group === "dm" ? 0 : 1,
          notes: [m.giPeriod.replace("{q}", fmtPeriod(p.ts, "q", lang))],
        }))}
        split={{ x: 0, y: 0 }}
        quadrants={{ tl: m.giQuadrants.stagflation, tr: m.giQuadrants.overheating, bl: m.giQuadrants.weak, br: m.giQuadrants.stable }}
        danger="tl"
        x={{ label: m.giX, suffix: " pp", digits: 1, signed: true }}
        y={{ label: m.giY, suffix: " pp", digits: 1, signed: true }}
        groups={[m.groups.dm, m.groups.em]}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart, name: m.country }}
      />
      <p className="text-[11px] text-muted">{m.giNote}</p>
    </div>
  );
}

export async function FiscalPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const { year, rows } = await getDebtTable(lang);
  const points = rows.flatMap((r) =>
    r.debt.value !== null && r.balance.value !== null
      ? [{ key: r.short, label: r.short, name: r.name, x: r.balance.value, y: r.debt.value, group: r.group === "dm" ? (0 as const) : (1 as const) }]
      : [],
  );
  if (!points.length) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <QuadrantScatter
        points={points}
        split={{ x: -3, y: 90 }}
        quadrants={{ tl: m.fiscalQuadrants.risk, tr: m.fiscalQuadrants.highDebt, bl: m.fiscalQuadrants.bigDeficit, br: m.fiscalQuadrants.sound }}
        danger="tl"
        x={{ label: m.fiscalX.replace("{year}", String(year)), suffix: "%", digits: 1, signed: true }}
        y={{ label: m.fiscalY.replace("{year}", String(year)), suffix: "%", digits: 0 }}
        groups={[m.groups.dm, m.groups.em]}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart, name: m.country }}
      />
      <p className="text-[11px] text-muted">{m.fiscalNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- economies scorecard

const STATUS_DOT: Record<Exclude<Status, null>, string> = {
  good: "bg-good",
  warn: "bg-warning",
  crit: "bg-critical",
};
const STATUS_BG: Record<Exclude<Status, null>, string> = {
  good: "",
  warn: "bg-warning/10",
  crit: "bg-critical/10",
};

function cellText(col: ScoreColDef, cell: ScoreCell, lang: Locale): string {
  const v = cell.value as number;
  if (col.key === "cli") return fmtNumber(v, lang, col.digits);
  return col.signed ? fmtSigned(v, lang, col.digits, "%") : `${fmtNumber(v, lang, col.digits)}%`;
}

function Cell({ col, cell, lang }: { col: ScoreColDef; cell: ScoreCell; lang: Locale }) {
  const d = getDict(lang);
  if (cell.value === null) return <td className="px-2 py-1.5 text-right align-top text-muted">—</td>;
  const period = cell.dxy
    ? "DXY"
    : cell.ts !== null && cell.freq
      ? cell.est
        ? `IMF ${fmtPeriod(cell.ts, "y", lang)}`
        : fmtPeriod(cell.ts, cell.freq, lang, true)
      : null;
  const status = cell.status ? d.macro.status[cell.status] : null;
  const tip = [pick(col.name, lang), status, cell.est ? d.macro.imfEst : null, cell.dxy ? d.macro.dxy : null].filter(Boolean).join(" · ");
  return (
    <td className={clsx("px-2 py-1.5 text-right align-top", cell.status && STATUS_BG[cell.status])} title={tip}>
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        {cell.status && <span aria-hidden className={clsx("inline-block size-1.5 shrink-0 rounded-full", STATUS_DOT[cell.status])} />}
        <span className="font-medium text-ink">{cellText(col, cell, lang)}</span>
        {cell.trend && (
          <span className="text-[10px] text-ink-2" aria-label={cell.trend === "up" ? d.macro.rising : d.macro.falling}>
            {cell.trend === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      {period && <div className="text-[10px] leading-tight whitespace-nowrap text-muted">{period}</div>}
      {status && <span className="sr-only">{status}</span>}
    </td>
  );
}

export async function ScorecardPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const rows = await getScorecard(lang);
  if (rows.every((r) => Object.values(r.cells).every((c) => c.value === null))) return <EmptyState lang={lang} />;
  const groups: ScoreRow["group"][] = ["dm", "em"];
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[900px] text-xs">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="sticky left-0 z-[1] bg-surface py-1 pr-2 text-left font-normal">
                {d.macro.country}
              </th>
              {SCORE_COLS.map((col) => (
                <th key={col.key} scope="col" className="px-2 py-1 text-right align-bottom font-normal" title={pick(col.hint, lang)}>
                  <span className="cursor-help underline decoration-dotted decoration-axis underline-offset-2">{pick(col.name, lang)}</span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr>
                <th colSpan={SCORE_COLS.length + 1} scope="colgroup" className="sticky left-0 pt-3 pb-1 text-left text-[11px] font-semibold text-ink-2">
                  {d.macro.groups[g]}
                </th>
              </tr>
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.short} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-2 text-left align-top font-normal whitespace-nowrap text-ink-2">
                      {r.name}
                    </th>
                    {SCORE_COLS.map((col) => (
                      <Cell key={col.key} col={col} cell={r.cells[col.key]} lang={lang} />
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        {(["good", "warn", "crit"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", STATUS_DOT[s])} />
            {d.macro.status[s]}
          </span>
        ))}
        <span>{d.macro.footnote}</span>
        <span>{d.macro.vnNote}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- theme panels (Phase 2)
// Each answers one question: the US in detail on the left (the deepest data,
// and the economy that moves everyone else), the major economies side by side
// on the right.

async function UsTiles({ keys, lang }: { keys: readonly SeriesKey[]; lang: Locale }) {
  const watch = await getWatchlist();
  const notes = await getInsightNotes(lang);
  const tiles = await getTiles([...keys]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-3">
      {tiles.map((t) => (
        <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
      ))}
    </div>
  );
}

function ThemeLayout({ us, world, lang }: { us: ReactNode; world: ReactNode; lang: Locale }) {
  const m = getDict(lang).macro;
  const head = "mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase";
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="min-w-0">
        <h3 className={head}>{m.us}</h3>
        {us}
      </section>
      <section className="min-w-0">
        <h3 className={head}>{m.world}</h3>
        {world}
      </section>
    </div>
  );
}

function multiplesLabels(lang: Locale, status?: Record<Exclude<Status, null>, string>) {
  const d = getDict(lang);
  return {
    table: d.common.showTable,
    chart: d.common.showChart,
    country: d.macro.country,
    period: d.macro.period,
    scale: d.macro.scale,
    ownScale: d.macro.ownScale,
    status,
  };
}

/** "OECD has no monthly data for: Japan" for the macro countries a small-multiples set leaves out; null when none. */
function missingNote(lines: CountryLine[], lang: Locale): string | null {
  const have = new Set(lines.map((l) => l.short));
  const missing = MACRO_COUNTRIES.filter((c) => !have.has(c.short)).map((c) => pick(c.name, lang));
  return missing.length ? getDict(lang).macro.missing.replace("{list}", missing.join(", ")) : null;
}

const toRow = (l: CountryLine, note?: string): MultipleRow => ({
  key: l.short,
  label: l.name,
  points: l.points,
  points2: l.points2,
  refValue: l.refValue,
  status: l.status,
  note,
});

function cellNote(prefix: string, cell: ScoreCell, lang: Locale): string | undefined {
  if (cell.value === null || cell.ts === null || !cell.freq) return undefined;
  const period = cell.est ? `IMF ${fmtPeriod(cell.ts, "y", lang)}` : fmtPeriod(cell.ts, cell.freq, lang, true);
  return `${prefix} ${period}: ${fmtSigned(cell.value, lang, 1, "%")}`;
}

export async function GrowthPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [cli, score] = await Promise.all([getOecdLines("CLI", lang), getScorecard(lang)]);
  const gdp = new Map(score.map((r) => [r.short, r.cells.gdp]));
  return (
    <ThemeLayout
      lang={lang}
      us={<UsTiles keys={MACRO_US.growth} lang={lang} />}
      world={
        cli.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-ink-2">{d.macro.cliTitle}</p>
            <SmallMultiples
              rows={cli.map((l) =>
                toRow(
                  l,
                  cellNote(
                    "GDP",
                    gdp.get(l.short) ?? {
                      value: null,
                      ts: null,
                      freq: null,
                      status: null,
                    },
                    lang,
                  ),
                ),
              )}
              series={[{ label: "CLI", color: "var(--s1)" }]}
              freq="m"
              digits={1}
              unit=""
              refValue={100}
              refLabel={d.macro.cliRef}
              locale={lang}
              labels={multiplesLabels(lang)}
            />
            {missingNote(cli, lang) && <p className="text-[11px] text-muted">{missingNote(cli, lang)}</p>}
          </div>
        ) : (
          <EmptyState lang={lang} message={d.macro.noClock} />
        )
      }
    />
  );
}

const PART_COLORS = ["var(--s4)", "var(--s3)", "var(--s1)", "var(--s2)", "var(--s7)"];

/** US CPI by group, y/y: which part of the basket keeps inflation up. */
async function UsCpiParts({ lang }: { lang: Locale }) {
  const m = getDict(lang).macro;
  const { rows, last } = await getUsCpiParts(lang);
  if (!last.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <p className="text-xs text-ink-2">
        {m.cpiPartsTitle} <span className="text-muted">· {fmtPeriod(last[0].ts, "m", lang)}</span>
      </p>
      <LineChart
        data={rows}
        xKey="ts"
        xFormat="month"
        series={last.map((p) => ({ key: p.key, label: p.name, color: PART_COLORS[US_CPI_PARTS.findIndex((x) => x.key === p.key)] }))}
        yDigits={1}
        ySuffix="%"
        refY={0}
        height={180}
        locale={lang}
        tableLabels={{ table: getDict(lang).common.showTable, chart: getDict(lang).common.showChart }}
      />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {last.map((p) => (
          <li key={p.key} className="flex items-baseline justify-between gap-2" title={p.change3 === null ? undefined : m.cpiParts3m.replace("{v}", fmtSigned(p.change3, lang, 1, " pp"))}>
            <span className="truncate text-ink-2">{p.name}</span>
            <span className="tabular whitespace-nowrap">
              <span className="font-medium text-ink">{fmtSigned(p.value, lang, 1, "%")}</span>
              {p.change3 !== null && Math.abs(p.change3) >= 0.05 && (
                <span className="ml-1 text-[10px] text-muted">
                  {p.change3 > 0 ? "▲" : "▼"}
                  {fmtNumber(Math.abs(p.change3), lang, 1)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">{m.cpiPartsNote}</p>
    </div>
  );
}

export async function InflationPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const cpi = await getOecdLines("CPI", lang);
  return (
    <ThemeLayout
      lang={lang}
      us={
        <>
          <UsTiles keys={MACRO_US.inflation} lang={lang} />
          <UsCpiParts lang={lang} />
        </>
      }
      world={
        cpi.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-ink-2">{d.macro.cpiTitle}</p>
            <SmallMultiples
              rows={cpi.map((l) => toRow(l))}
              series={[{ label: "CPI", color: "var(--s1)" }]}
              freq="m"
              digits={1}
              unit="%"
              refLabel={d.macro.cpiRef}
              locale={lang}
              labels={multiplesLabels(lang, d.macro.status)}
            />
            <p className="text-[11px] text-muted">{[d.macro.cpiNote, missingNote(cpi, lang)].filter(Boolean).join(" ")}</p>
          </div>
        ) : (
          <EmptyState lang={lang} />
        )
      }
    />
  );
}

/** Horizontal bars from a zero line, one per country in the order given, value printed at the end; two columns (top to bottom) from sm up. */
function ZeroBars({ rows, lang, hint }: { rows: { key: string; label: string; value: number; title: string }[]; lang: Locale; hint: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul
      className="grid gap-x-8 gap-y-1 text-xs sm:grid-flow-col sm:[grid-template-rows:repeat(var(--rows),auto)]"
      style={{ "--rows": Math.ceil(rows.length / 2) } as CSSProperties}
      aria-label={hint}
    >
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        return (
          <li key={r.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2" title={r.title}>
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="relative h-2.5">
              <span aria-hidden className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px bg-axis" />
              <span
                aria-hidden
                className={clsx("absolute top-0 h-full bg-s1", r.value >= 0 ? "rounded-r" : "rounded-l")}
                style={r.value >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
              />
            </span>
            <span className="tabular text-right font-medium text-ink">{fmtSigned(r.value, lang, 1, "%")}</span>
          </li>
        );
      })}
    </ul>
  );
}

export async function MoneyPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const [lines, reer] = await Promise.all([getPolicyLines(lang), getReer(lang)]);
  return (
    <ThemeLayout
      lang={lang}
      us={<UsTiles keys={MACRO_US.money} lang={lang} />}
      world={
        lines.length || reer.length ? (
          <div className="flex flex-col gap-1">
            {lines.length > 0 && (
              <SmallMultiples
                rows={lines.map((l) => toRow(l))}
                series={[
                  { label: m.policyRate, color: "var(--s1)" },
                  { label: m.realRate, color: "var(--s2)" },
                ]}
                freq="m"
                digits={2}
                unit="%"
                refValue={0}
                refLabel="0%"
                ownScale={2}
                locale={lang}
                labels={multiplesLabels(lang)}
              />
            )}
            {lines.length > 0 && <p className="text-[11px] text-muted">{m.euroNote}</p>}
            {reer.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <p className="text-xs text-ink-2" title={m.reerHint}>
                  {m.reerTitle} <span className="text-muted">· {fmtPeriod(reer[0].ts, "m", lang)}</span>
                </p>
                <ZeroBars
                  lang={lang}
                  hint={m.reerTitle}
                  rows={reer.map((r) => ({
                    key: r.short,
                    label: r.name,
                    value: r.deviation,
                    title: `${r.name}: ${fmtSigned(r.deviation, lang, 1, "%")} · ${m.reerHint}`,
                  }))}
                />
                <p className="text-[11px] text-muted">{m.reerHint}</p>
              </div>
            )}
          </div>
        ) : (
          <EmptyState lang={lang} />
        )
      }
    />
  );
}

function ConfidenceValue({ cell, lang }: { cell: ConfidenceCell | null; lang: Locale }) {
  const m = getDict(lang).macro;
  if (!cell) return <td className="py-1 pl-2 text-right text-muted">—</td>;
  const dir = cell.change === null ? 0 : cell.change;
  return (
    <td
      className="py-1 pl-2 text-right whitespace-nowrap"
      title={`${fmtPeriod(cell.ts, "m", lang)}${cell.change !== null ? ` · ${m.change3m} ${fmtSigned(cell.change, lang, 1)}` : ""}`}
    >
      <span className={clsx("font-medium", cell.value < 100 ? "text-ink-2" : "text-ink")}>{fmtNumber(cell.value, lang, 1)}</span>
      {cell.change !== null && (
        <span className="ml-1 text-[10px] text-ink-2" aria-label={`${m.change3m} ${fmtSigned(cell.change, lang, 1)}`}>
          {dir > 0 ? "▲" : dir < 0 ? "▼" : "•"}
        </span>
      )}
    </td>
  );
}

export async function JobsPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const [une, conf] = await Promise.all([getOecdLines("UNE", lang), getConfidence(lang)]);
  return (
    <ThemeLayout
      lang={lang}
      us={<UsTiles keys={MACRO_US.jobs} lang={lang} />}
      world={
        une.length || conf.length ? (
          <div className="flex flex-col gap-1">
            {une.length > 0 && <p className="text-xs text-ink-2">{m.uneTitle}</p>}
            {une.length > 0 && (
              <SmallMultiples
                rows={une.map((l) => toRow(l))}
                series={[{ label: m.unemployment, color: "var(--s1)" }]}
                freq="m"
                digits={1}
                unit="%"
                ownScale={1.5}
                locale={lang}
                labels={multiplesLabels(lang, m.uneStatus)}
              />
            )}
            {une.length > 0 && <p className="text-[11px] text-muted">{[m.uneNote, missingNote(une, lang)].filter(Boolean).join(" ")}</p>}
            {conf.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-xs text-ink-2">{m.confTitle}</p>
                {/* Two half-tables side by side keep fifteen rows short. */}
                <div className="grid gap-x-8 sm:grid-cols-2">
                  {[conf.slice(0, Math.ceil(conf.length / 2)), conf.slice(Math.ceil(conf.length / 2))].map((half, i) => (
                    <table key={i} className={clsx("tabular w-full text-xs", i && "max-sm:[&_thead]:hidden")}>
                      <thead className="text-muted">
                        <tr>
                          <th scope="col" className="py-1 text-left font-normal">
                            {m.country}
                          </th>
                          <th scope="col" className="py-1 pl-2 text-right font-normal">
                            {m.consumer}
                          </th>
                          <th scope="col" className="py-1 pl-2 text-right font-normal">
                            {m.business}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {half.map((r) => (
                          <tr key={r.short} className="border-t border-line">
                            <th scope="row" className="py-1 text-left font-normal text-ink-2">
                              {r.name}
                            </th>
                            <ConfidenceValue cell={r.consumer} lang={lang} />
                            <ConfidenceValue cell={r.business} lang={lang} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
                </div>
                <p className="text-[11px] text-muted">{m.confHint}</p>
              </div>
            )}
          </div>
        ) : (
          <EmptyState lang={lang} />
        )
      }
    />
  );
}

/** `unit` "%" for shares of GDP, " pp" for the credit gap (a distance from trend). */
function DebtCell({ cell, lang, digits, signed, hint, unit = "%" }: { cell: ScoreCell; lang: Locale; digits: number; signed?: boolean; hint: string; unit?: "%" | " pp" }) {
  const d = getDict(lang);
  if (cell.value === null) return <td className="px-2 py-1.5 text-right text-muted">—</td>;
  const status = cell.status ? d.macro.status[cell.status] : null;
  const period = cell.ts !== null && cell.freq ? (cell.est ? `IMF ${fmtPeriod(cell.ts, "y", lang)}` : fmtPeriod(cell.ts, cell.freq, lang, true)) : null;
  return (
    <td className={clsx("px-2 py-1.5 text-right align-top", cell.status && STATUS_BG[cell.status])} title={[hint, status].filter(Boolean).join(" · ")}>
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        {cell.status && <span aria-hidden className={clsx("inline-block size-1.5 shrink-0 rounded-full", STATUS_DOT[cell.status])} />}
        <span className="font-medium text-ink">{signed ? fmtSigned(cell.value, lang, digits, unit) : `${fmtNumber(cell.value, lang, digits)}${unit}`}</span>
      </div>
      {period && <div className="text-[10px] leading-tight whitespace-nowrap text-muted">{period}</div>}
      {status && <span className="sr-only">{status}</span>}
    </td>
  );
}

export async function DebtPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const { year, rows } = await getDebtTable(lang);
  const any = rows.some((r) => r.debt.value !== null || r.creditGap.value !== null);
  const th = "px-2 py-1 text-right align-bottom font-normal";
  const hdr = (text: string, hint: string) => (
    <th scope="col" className={th} title={hint}>
      <span className="cursor-help underline decoration-dotted decoration-axis underline-offset-2">{text}</span>
    </th>
  );
  return (
    <ThemeLayout
      lang={lang}
      us={<UsTiles keys={MACRO_US.debt} lang={lang} />}
      world={
        any ? (
          <div className="flex flex-col gap-2">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="tabular w-full min-w-[480px] text-xs">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="sticky left-0 z-[1] bg-surface py-1 pr-2 text-left font-normal">
                      {m.country}
                    </th>
                    {hdr(m.debtNow.replace("{year}", String(year)), m.debtHint)}
                    {hdr(m.debtSince2019, m.debtSince2019Hint)}
                    {hdr(m.balance.replace("{year}", String(year)), m.balanceHint)}
                    {hdr(m.creditGap, m.creditGapHint)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.short} className="border-t border-line">
                      <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-2 text-left align-top font-normal whitespace-nowrap text-ink-2">
                        {r.name}
                      </th>
                      <DebtCell cell={r.debt} lang={lang} digits={0} hint={m.debtHint} />
                      <td className="px-2 py-1.5 text-right align-top text-ink-2">
                        {r.debtSince2019 === null ? "—" : `${fmtSigned(r.debtSince2019, lang, 0)} pp`}
                      </td>
                      <DebtCell cell={r.balance} lang={lang} digits={1} signed hint={m.balanceHint} />
                      <DebtCell cell={r.creditGap} lang={lang} digits={1} signed unit=" pp" hint={m.creditGapHint} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">{m.debtFootnote}</p>
          </div>
        ) : (
          <EmptyState lang={lang} />
        )
      }
    />
  );
}

type Alarm = "warn" | "crit" | null;

/** "> 30%" / "< 0" from a threshold; warn level first, then the alarm level. */
function ruleText(def: SeriesDef, lang: Locale): string {
  const t = def.threshold;
  if (!t) return "—";
  const op = t.dir === "above" ? ">" : "<";
  const v = (x: number) => fmtValue(def, x, lang);
  return t.crit === undefined ? `${op} ${v(t.warn)}` : `${op} ${v(t.warn)} · ${op} ${v(t.crit)}`;
}

export async function RecessionPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const m = d.macro;
  const [tiles, clock] = await Promise.all([getTiles([...RECESSION_SIGNALS]), getCycleClock(lang)]);
  if (tiles.every((t) => !t.data) && !clock.length) return <EmptyState lang={lang} />;
  const down = clock.filter((c) => c.phase === "downturn");
  const downShare = clock.length ? down.length / clock.length : 0;
  const cliStatus: Alarm = !clock.length ? null : downShare >= 0.5 ? "crit" : downShare >= 1 / 3 ? "warn" : null;
  const states = tiles.map((t) => (t.data ? alertOf(t.def, t.data.value) : null));
  const on = [...states, cliStatus].filter(Boolean).length;
  const total = tiles.length + (clock.length ? 1 : 0);
  const chip = (s: Alarm) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={clsx("inline-block size-2 rounded-full", s === "crit" ? "bg-critical" : s === "warn" ? "bg-warning" : "bg-good")} />
      {s ? d.highlights.reasons[s] : m.calm}
    </span>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        <span className="font-semibold">{m.signalsOn.replace("{n}", String(on)).replace("{total}", String(total))}</span>
        <span className="text-ink-2"> · {m.signalsHint}</span>
      </p>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[520px] text-xs">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 text-left font-normal">
                {m.signal}
              </th>
              <th scope="col" className="px-2 py-1 text-right font-normal">
                {m.latest}
              </th>
              <th scope="col" className="w-24 px-2 py-1 font-normal">
                <span className="sr-only">{d.charts.spark.m}</span>
              </th>
              <th scope="col" className="px-2 py-1 text-right font-normal">
                {m.rule}
              </th>
              <th scope="col" className="py-1 pl-2 text-left font-normal">
                {m.state}
              </th>
            </tr>
          </thead>
          <tbody>
            {tiles.map((t, i) => (
              <tr key={t.key} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2" title={pick(t.def.explain, lang)}>
                  {pick(t.def.name, lang)}
                </th>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  {t.data ? (
                    <>
                      <span className="font-semibold text-ink">{fmtValue(t.def, t.data.value, lang)}</span>
                      {t.def.freq && <span className="ml-1 text-[10px] text-muted">{fmtPeriod(t.data.ts, t.def.freq, lang, true)}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5">{t.data && <Sparkline points={t.data.spark} height={20} fluid label={pick(t.def.name, lang)} />}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap text-muted">{ruleText(t.def, lang)}</td>
                <td className="py-1.5 pl-2 text-ink-2">{t.data ? chip(states[i]) : "—"}</td>
              </tr>
            ))}
            {clock.length > 0 && (
              <tr className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2" title={m.cliDownHint}>
                  {m.cliDown}
                </th>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <span className="font-semibold text-ink">
                    {down.length}/{clock.length}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-[10px] text-muted">{down.map((c) => c.short).join(" · ")}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap text-muted">≥ ⅓ · ≥ ½</td>
                <td className="py-1.5 pl-2 text-ink-2">{chip(cliStatus)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">{m.signalsFootnote}</p>
    </div>
  );
}
