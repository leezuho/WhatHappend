import type { ReactNode } from "react";
import clsx from "clsx";
import { SERIES, VITAL_SIGNS, type SeriesDef, type SeriesKey } from "@/config/series";
import { getDict, pick, type Dict, type Locale } from "@/lib/i18n";
import { fmtAxisPct, fmtDate, fmtDelta, fmtNumber, fmtPct, fmtPeriod, fmtSigned, fmtTime, fmtValue } from "@/lib/format";
import type { TileData } from "@/lib/data/series";
import type { Component as RegimeComponent, RegimeResult } from "@/lib/signals/risk-regime";
import {
  getAssetClasses,
  getCommodities,
  getCountryMacro,
  getHighlights,
  getHistory,
  getInsightNotes,
  getRegime,
  getSpreadHistory,
  getTicker,
  getTiles,
  getWatchlist,
  getWorldMarkets,
  getYieldCurve,
  type Highlight,
  type Tile,
} from "@/lib/queries";
import { COMMODITY_GROUPS, type MarketRegion } from "@/config/markets";
import { BarList } from "@/components/charts/BarList";
import { MarketTable, MoveSummary } from "@/components/panels/MarketTable";
import { TileDetail } from "@/components/charts/TileDetail";
import { KpiTile } from "@/components/charts/KpiTile";
import { alertOf, type Reason } from "@/lib/signals/notable";
import { LineChart } from "@/components/charts/LineChart";
import { DumbbellChart } from "@/components/charts/DumbbellChart";
import { EmptyState } from "@/components/ui/Panel";

// ---------------------------------------------------------------- tiles

/** A KPI tile that opens its history (and pin toggle) on click. */
export function DetailTile({
  tile,
  lang,
  watched,
  note,
  sources,
  footer,
}: {
  tile: Tile;
  lang: Locale;
  watched: boolean;
  note?: string;
  sources?: { source: string; url: string; title: string }[];
  footer?: ReactNode;
}) {
  const d = getDict(lang);
  const shown = tile.def;
  return (
    <TileDetail
      seriesKey={tile.key}
      name={pick(shown.name, lang)}
      explain={pick(shown.explain, lang)}
      note={note}
      sources={sources}
      unit={shown.unit}
      digits={shown.digits}
      watched={watched}
      price={shown.price}
      locale={lang}
      labels={{ ...d.detail, close: d.common.close, table: d.common.showTable, chart: d.common.showChart }}
    >
      <KpiTile def={shown} data={tile.data} locale={lang} footer={footer} />
    </TileDetail>
  );
}

/**
 * Vital signs (BR-02) with what stands out (LLDD 04 §3): the dozen fixed tiles, then the other indicators that stand
 * out right now, then the reader's pinned ones. A tile that stands out carries its reasons and the AI's one line; the
 * full note and its sources open with the tile. One panel, so an unusual Brent is not shown twice.
 */
export async function VitalSigns({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.highlights;
  const [watch, { items, hasKey }, tiles] = await Promise.all([getWatchlist(), getHighlights(lang), getTiles(VITAL_SIGNS)]);
  const notable = new Map(items.map((i) => [i.key, i]));
  const others: Tile[] = items.filter((i) => !VITAL_SIGNS.includes(i.key)).map((i) => ({ key: i.key, def: i.def, data: i.data }));
  const pinned = await getTiles(watch.filter((k) => !VITAL_SIGNS.includes(k) && !notable.has(k)));
  if (tiles.every((x) => !x.data) && !others.length) return <EmptyState lang={lang} />;
  const latest = items.reduce<number | null>((a, i) => (i.note && (a === null || i.note.createdAt > a) ? i.note.createdAt : a), null);
  const model = items.find((i) => i.note?.createdAt === latest)?.note?.model;
  const grid = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6";
  const cell = (tile: Tile) => {
    const it = notable.get(tile.key);
    return (
      <DetailTile
        key={tile.key}
        tile={tile}
        lang={lang}
        watched={watch.includes(tile.key)}
        note={it?.note?.text}
        sources={it?.note?.sources}
        footer={it && <StandsOut it={it} lang={lang} />}
      />
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className={grid}>{tiles.map(cell)}</div>
      {others.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-2">{t.others}</h3>
          <div className={grid}>{others.map(cell)}</div>
        </>
      )}
      {pinned.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-2">★ {d.detail.watchlist}</h3>
          <div className={grid}>{pinned.map(cell)}</div>
        </>
      )}
      <p className="text-[11px] text-muted">
        {items.length ? t.rules : t.empty}
        {!hasKey ? ` ${t.needsKey}` : latest && model ? ` · AI ${fmtTime(latest, lang)} · ${model}` : ""}
      </p>
    </div>
  );
}

const ECONOMY: SeriesKey[] = ["claims", "sahm", "gdpnow", "cpi", "fedfunds", "breakeven", "walcl", "gscpi"];

export async function EconomyPulse({ lang }: { lang: Locale }) {
  const watch = await getWatchlist();
  const notes = await getInsightNotes(lang);
  const tiles = await getTiles(ECONOMY);
  if (tiles.every((t) => !t.data)) return <EmptyState lang={lang} />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- what stands out

function reasonLabel(r: Reason, t: Dict["highlights"]): string {
  switch (r.kind) {
    case "move":
      return r.z > 0 ? t.reasons.moveUp : t.reasons.moveDown;
    case "week":
      return r.z > 0 ? t.reasons.weekUp : t.reasons.weekDown;
    case "crit":
      return r.fresh ? t.reasons.critNew : t.reasons.crit;
    case "warn":
      return r.fresh ? t.reasons.warnNew : t.reasons.warn;
    default:
      return t.reasons[r.kind];
  }
}

function reasonTip(r: Reason, def: SeriesDef, data: TileData, t: Dict["highlights"], lang: Locale): string | undefined {
  switch (r.kind) {
    case "move":
      return t.moveTip.replace("{z}", fmtNumber(Math.abs(r.z), lang, 1));
    case "week":
      return t.weekTip.replace("{change}", fmtDelta(def, { ...data, change: r.change, changePct: r.change }, lang) ?? "").replace("{z}", fmtNumber(Math.abs(r.z), lang, 1));
    case "crit":
    case "warn":
      return t.sinceTip.replace("{date}", def.freq ? fmtPeriod(r.since, def.freq, lang) : fmtDate(r.since, lang, { day: "numeric", month: "short", year: "numeric" }));
    default:
      return undefined;
  }
}

/**
 * The bottom of a tile that stands out: why (a level crossed long ago is left to the tile's own "Watch"/"Danger"
 * badge) and what changed, why it matters, in the AI's one line.
 */
function StandsOut({ it, lang }: { it: Highlight; lang: Locale }) {
  const t = getDict(lang).highlights;
  const reasons = it.reasons.filter((r) => !((r.kind === "warn" || r.kind === "crit") && !r.fresh));
  return (
    <div className="mt-0.5 flex flex-col gap-1 border-t border-line pt-1.5">
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reasons.map((r) => (
            <span
              key={r.kind}
              className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-px text-[10px] text-ink-2"
              title={reasonTip(r, it.def, it.data, t, lang)}
            >
              {(r.kind === "crit" || r.kind === "warn") && (
                <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", r.kind === "crit" ? "bg-critical" : "bg-warning")} />
              )}
              {reasonLabel(r, t)}
            </span>
          ))}
        </div>
      )}
      {it.note && <p className="text-xs leading-snug text-ink-2">{it.note.line}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- yield curve

export async function YieldCurvePanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const curve = await getYieldCurve();
  if (!curve.rows.length) return <EmptyState lang={lang} />;
  const hist = await getSpreadHistory();
  const label = (base: string, ts: number | null) => (ts ? `${base} (${fmtDate(ts, lang)})` : base);
  const spreadName = { s2s10: "2s10s (10Y − 2Y)", s3m10: "10Y − 3M" } as const;
  const day = (ts: number) => fmtDate(ts, lang, { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="flex flex-col gap-2">
      <LineChart
        data={curve.rows}
        xKey="tenor"
        xFormat="category"
        series={[
          { key: "now", label: label(d.charts.today, curve.asOf.now), color: "var(--s1)" },
          { key: "m1", label: label(d.charts.monthAgo, curve.asOf.m1), color: "var(--s2)" },
          { key: "y1", label: label(d.charts.yearAgo, curve.asOf.y1), color: "var(--s3)" },
        ]}
        area
        yDigits={2}
        ySuffix="%"
        height={210}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      {hist.rows.length > 1 && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <p className="text-[11px] font-semibold text-ink-2">{d.charts.spreadHistory}</p>
          <LineChart
            data={hist.rows}
            xKey="ts"
            xFormat="month"
            series={[
              { key: "s2s10", label: spreadName.s2s10, color: "var(--s1)" },
              { key: "s3m10", label: spreadName.s3m10, color: "var(--s2)" },
            ]}
            refY={0}
            yDigits={2}
            height={140}
            locale={lang}
            tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
          />
          <ul className="flex flex-col gap-0.5 text-xs text-ink-2">
            {hist.runs.map((r) => (
              <li key={r.key}>
                {spreadName[r.key]}: <span className="tabular font-semibold text-ink">{fmtNumber(r.value, lang, 2)} pp</span>{" "}
                <span className={clsx("ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px]", r.inverted ? "text-down" : "text-ink-2")}>
                  {r.inverted ? d.charts.inverted : d.charts.normal}
                </span>{" "}
                <span className="text-muted">
                  · {(r.inverted ? d.charts.invertedSince : d.charts.positiveSince).replace("{date}", day(r.since))}
                  {r.atLeast && d.charts.orEarlier}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">{d.charts.uninvertHint}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- inflation vs policy rates

export async function InflationRatesPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const { rows } = await getCountryMacro(lang);
  if (rows.every((r) => r.inflation === null && r.rate === null)) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <DumbbellChart
        rows={rows.map((r) => ({ key: r.short, label: r.inflationEst ? `${r.name} *` : r.name, a: r.inflation, b: r.rate }))}
        a={{ label: d.charts.inflation, color: "var(--s1)" }}
        b={{ label: d.charts.policyRate, color: "var(--s2)" }}
        gapLabel={d.charts.realRate}
        gapHint={d.charts.realRateHint}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      <p className="text-[11px] text-muted">
        {d.charts.rateVn}
        {rows.some((r) => r.inflationEst) && ` ${d.charts.inflationEst}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- world markets

/** Two columns from xl: the Americas and Europe beside Asia-Pacific (11 and 9 rows). */
const MARKET_COLUMNS: MarketRegion[][] = [["americas", "europe"], ["asia"]];

export async function WorldMarkets({ lang }: { lang: Locale }) {
  const t = getDict(lang).markets;
  const rows = await getWorldMarkets(lang);
  if (rows.every((r) => r.price === null)) return <EmptyState lang={lang} />;
  const group = (region: MarketRegion) => ({ key: region, label: t.regions[region], rows: rows.filter((r) => r.region === region).map((r) => ({ ...r, sub: r.country })) });

  return (
    <div className="flex flex-col gap-3">
      <MoveSummary rows={rows} template={t.summary} lang={lang} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 xl:grid-cols-2">
        {MARKET_COLUMNS.map((regions) => (
          <MarketTable key={regions.join()} groups={regions.map(group)} nameHead={t.index} priceHead={t.price} lang={lang} />
        ))}
      </div>
      <p className="text-[10px] leading-snug text-muted">
        {t.note} · {t.source}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- commodities

export async function Commodities({ lang }: { lang: Locale }) {
  const t = getDict(lang).markets;
  const rows = await getCommodities(lang);
  if (rows.every((r) => r.price === null)) return <EmptyState lang={lang} />;
  const groups = COMMODITY_GROUPS.map((g) => ({ key: g, label: t.groups[g], rows: rows.filter((r) => r.group === g).map((r) => ({ ...r, sub: r.unit })) }));
  return (
    <div className="flex flex-col gap-3">
      <MoveSummary rows={rows} template={t.summaryCommodities} lang={lang} />
      <MarketTable groups={groups} nameHead={t.commodity} priceHead={t.priceCommodity} lang={lang} />
      <p className="text-[10px] leading-snug text-muted">
        {t.noteCommodities} · Yahoo Finance
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- asset classes this year

export async function AssetClasses({ lang }: { lang: Locale }) {
  const t = getDict(lang).markets;
  const rows = await getAssetClasses(lang);
  if (rows.every((r) => r.ytd === null)) return <EmptyState lang={lang} />;
  const year = new Date().getUTCFullYear();
  return (
    <div className="flex flex-col gap-2">
      <BarList
        rows={rows.map((r) => ({ key: r.id, label: r.name, value: r.ytd, text: r.ytd === null ? "—" : fmtPct(r.ytd, lang, 1) }))}
        color="sign"
        tick={(v) => fmtAxisPct(v, lang)}
        label={t.assetsLabel.replace("{year}", String(year))}
      />
      <p className="text-[10px] leading-snug text-muted">{t.noteAssets}</p>
    </div>
  );
}

// ---------------------------------------------------------------- stress small multiples

const STRESS: { key: SeriesKey; id: string }[] = [
  { key: "vix", id: SERIES.vix.id },
  { key: "hy", id: SERIES.hy.id },
  { key: "fsi", id: SERIES.fsi.id },
  { key: "gpr", id: "gpr:GPRD_MA7" },
];

export async function StressPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const hist = await getHistory(STRESS.map((s) => s.id));
  if (STRESS.every((s) => !hist[s.id]?.length)) return <EmptyState lang={lang} />;
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {STRESS.map(({ key, id }) => {
        const def = SERIES[key];
        const pts = hist[id] ?? [];
        const last = pts[pts.length - 1];
        const alert = last ? alertOf(def, last.value) : null;
        return (
          <div key={key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-ink-2" title={pick(def.explain, lang)}>
                {pick(def.name, lang)}
              </span>
              {last && (
                <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {alert && <span aria-hidden className={clsx("inline-block size-2 rounded-full", alert === "crit" ? "bg-critical" : "bg-warning")} />}
                  {fmtNumber(last.value, lang, def.digits)}
                  {def.unit === "%" ? "%" : ""}
                </span>
              )}
            </div>
            <LineChart
              data={pts.map((p) => ({ ts: p.ts, v: p.value }))}
              xKey="ts"
              xFormat="month"
              series={[{ key: "v", label: def.short, color: "var(--s1)" }]}
              area
              zones={def.threshold}
              yDigits={def.digits > 1 ? 1 : def.digits}
              height={96}
              locale={lang}
              tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
            />
          </div>
        );
      })}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted sm:col-span-2">
        <span>{d.charts.lastYear}.</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm border-t border-warning bg-warning/15" />
          {d.highlights.reasons.warn}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm bg-critical/15" />
          {d.highlights.reasons.crit}
        </span>
        <span>
          ─ = {d.charts.warnLine}
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- top bar pieces

const REGIME_STYLE = {
  "risk-on": "bg-good",
  neutral: "bg-axis",
  "risk-off": "bg-critical",
  unknown: "bg-surface-2",
} as const;

function regimeLabel(r: RegimeResult["regime"], t: Dict["regime"]): string {
  return r === "risk-on" ? t.riskOn : r === "risk-off" ? t.riskOff : r === "neutral" ? t.neutral : t.unknown;
}

/** A component's reading in its own unit. */
function regimeValue(c: RegimeComponent, lang: Locale): string {
  switch (c.key) {
    case "credit":
      return `${fmtNumber(c.value, lang, 2)}%`;
    case "dxy":
    case "trend":
      return fmtPct(c.value, lang, 1);
    case "curve":
      return fmtValue(SERIES.curve, c.value, lang);
    case "breadth":
      return c.count ? `${c.count.above}/${c.count.total}` : fmtNumber(c.value * 100, lang, 0) + "%";
    default:
      return fmtNumber(c.value, lang, 2);
  }
}

export async function RegimeBadge({ lang }: { lang: Locale }) {
  const t = getDict(lang).regime;
  const r = await getRegime();
  const label = regimeLabel(r.regime, t);
  const div = r.divergence;
  return (
    <details className="relative">
      <summary
        title={`${t.title}: ${label}${div ? ` · ${t.divergenceShort}` : ""}`}
        className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2 shadow-card transition-colors hover:bg-surface-2"
      >
        <span aria-hidden className={clsx("inline-block size-2 rounded-full", REGIME_STYLE[r.regime])} />
        <span className="sr-only 2xl:not-sr-only">{t.title}:</span>
        <span className="font-semibold text-ink">{label}</span>
        {div && (
          <span className="grid size-4 place-items-center rounded-full bg-warning/20 text-[10px] leading-none font-bold text-ink">
            <span aria-hidden>!</span>
            <span className="sr-only">{t.divergenceShort}</span>
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 text-xs shadow-lift">
        {div && (
          <p className="mb-2.5 rounded-lg bg-warning/10 px-2.5 py-2 text-ink-2">
            <span className="font-semibold text-ink">{t.divergenceTitle}</span>{" "}
            {t.divergence
              .replace("{hy}", `${fmtNumber(div.hy, lang, 2)}%`)
              .replace("{date}", fmtDate(div.hyTs, lang))
              .replace("{bp}", fmtNumber((div.hy - div.low) * 100, lang, 0))
              .replace("{low}", `${fmtNumber(div.low, lang, 2)}%`)
              .replace("{lowDate}", fmtDate(div.lowTs, lang))
              .replace("{gap}", `${fmtNumber(div.spxGap, lang, 1)}%`)}
          </p>
        )}
        <p className="mb-2 text-ink-2">{t.explain}</p>
        {r.score !== null && (
          <p className="mb-1">
            {t.score}: <span className="tabular font-semibold text-ink">{fmtNumber(r.score, lang, 2)}</span>
            {r.since !== null && <span className="text-muted"> · {(r.sinceAtLeast ? t.sinceAtLeast : t.since).replace("{date}", fmtDate(r.since, lang))}</span>}
            {r.override && <span className="ml-1 text-down">({r.override})</span>}
          </p>
        )}
        {r.pending && <p className="mb-1 text-ink-2">{t.pending.replace("{regime}", regimeLabel(r.pending, t))}</p>}
        <ul className="mt-2 flex flex-col gap-1">
          {r.components.map((c) => (
            <li
              key={c.key}
              className="grid grid-cols-[minmax(0,1fr)_auto_3.25rem] items-baseline gap-x-2"
              title={[c.years ? t.years.replace("{n}", String(c.years)) : null, c.weight < 1 ? t.halfWeight : null].filter(Boolean).join(" · ") || undefined}
            >
              <span className="truncate text-ink-2">{t.components[c.key]}</span>
              <span className={clsx("tabular", c.weight < 1 ? "text-muted italic" : "text-ink-2")}>
                {regimeValue(c, lang)} <span className="text-muted">· {fmtDate(c.ts, lang)}</span>
                {c.weight < 1 && <span className="sr-only"> ({t.halfWeight})</span>}
              </span>
              <span className={clsx("tabular text-right font-medium", c.z > 0.5 ? "text-down" : c.z < -0.5 ? "text-up" : "text-ink")}>
                {fmtSigned(c.z, lang, 2)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">{t.rules.replace("{on}", t.riskOn).replace("{off}", t.riskOff)}</p>
      </div>
    </details>
  );
}

export async function Ticker({ lang }: { lang: Locale }) {
  const items = await getTicker();
  if (!items.length) return null;
  const row = items.map((it) => (
    <span key={it.label} className="flex shrink-0 items-baseline gap-1.5 px-4">
      <span className="text-ink-2">{it.label}</span>
      <span className="tabular text-ink">{fmtNumber(it.price, lang, it.digits)}</span>
      {it.changePct !== null && (
        <span className={clsx("tabular", it.changePct > 0 ? "text-up" : it.changePct < 0 ? "text-down" : "text-muted")}>
          {it.changePct > 0 ? "▲" : it.changePct < 0 ? "▼" : ""}
          {fmtPct(it.changePct, lang)}
        </span>
      )}
    </span>
  ));
  return (
    <div className="ticker-mask overflow-hidden border-t border-line text-xs" aria-label={getDict(lang).topbar.ticker}>
      <div className="ticker-track flex w-max py-1.5">
        {row}
        <span aria-hidden className="flex">
          {row}
        </span>
      </div>
    </div>
  );
}
