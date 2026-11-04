import clsx from "clsx";
import { CPI_YOY, SERIES, VITAL_SIGNS, type SeriesKey } from "@/config/series";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDate, fmtDelta, fmtNumber, fmtPct, fmtTime, fmtValue } from "@/lib/format";
import { getCountryMacro, getHighlights, getHistory, getInsightNotes, getRegime, getTicker, getTiles, getWatchlist, getYieldCurve, type Tile } from "@/lib/queries";
import { TileDetail } from "@/components/charts/TileDetail";
import type { SeriesDef } from "@/config/series";
import { KpiTile } from "@/components/charts/KpiTile";
import { alertOf } from "@/lib/signals/notable";
import { LineChart } from "@/components/charts/LineChart";
import { DumbbellChart } from "@/components/charts/DumbbellChart";
import { EmptyState } from "@/components/ui/Panel";

// ---------------------------------------------------------------- tiles

/** A KPI tile that opens its history (and pin toggle) on click. */
export function DetailTile({ tile, def, lang, watched, note }: { tile: Tile; def?: SeriesDef; lang: Locale; watched: boolean; note?: string }) {
  const d = getDict(lang);
  const shown = def ?? tile.def;
  return (
    <TileDetail
      seriesKey={tile.key}
      name={pick(shown.name, lang)}
      explain={pick(shown.explain, lang)}
      note={note}
      unit={tile.key === "cpi" ? "%" : shown.unit}
      digits={shown.digits}
      watched={watched}
      price={shown.price}
      locale={lang}
      labels={{ ...d.detail, close: d.common.close, table: d.common.showTable, chart: d.common.showChart }}
    >
      <KpiTile def={shown} data={tile.data} locale={lang} />
    </TileDetail>
  );
}

export async function VitalSigns({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const watch = await getWatchlist();
  const notes = await getInsightNotes(lang);
  const tiles = await getTiles(VITAL_SIGNS);
  const extra = await getTiles(watch.filter((k) => !VITAL_SIGNS.includes(k)));
  if (tiles.every((t) => !t.data)) return <EmptyState lang={lang} />;
  const grid = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6";
  return (
    <div className="flex flex-col gap-3">
      <div className={grid}>
        {tiles.map((t) => (
          <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
        ))}
      </div>
      {extra.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-2">★ {d.detail.watchlist}</h3>
          <div className={grid}>
            {extra.map((t) => (
              <DetailTile key={t.key} tile={t} def={t.key === "cpi" ? CPI_YOY : undefined} lang={lang} watched note={notes[t.key]} />
            ))}
          </div>
        </>
      )}
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
        <DetailTile key={t.key} tile={t} def={t.key === "cpi" ? CPI_YOY : undefined} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- what stands out

export async function HighlightsBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.highlights;
  const { items, hasKey } = await getHighlights(lang);
  const watch = await getWatchlist();
  if (!items.length) return <EmptyState lang={lang} message={t.empty} />;
  const latest = items.reduce<number | null>((a, i) => (i.note && (a === null || i.note.createdAt > a) ? i.note.createdAt : a), null);
  const model = items.find((i) => i.note?.createdAt === latest)?.note?.model;

  return (
    <div className="flex flex-col gap-2">
      <ul className="scroll-thin grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it) => {
          const name = pick(it.def.name, lang);
          const delta = fmtDelta(it.def, it.data, lang);
          const dir = (it.def.delta === "abs" ? it.data.change : it.data.changePct) ?? 0;
          const good = it.def.polarity === "neutral" ? null : (dir > 0) === (it.def.polarity === "up-good");
          return (
            <li key={it.key} className="flex flex-col rounded-lg bg-surface-2/60">
              <TileDetail
                seriesKey={it.key}
                name={name}
                explain={pick(it.def.explain, lang)}
                note={it.note?.text}
                unit={it.def.unit}
                digits={it.def.digits}
                watched={watch.includes(it.key)}
                price={it.def.price}
                locale={lang}
                labels={{ ...d.detail, close: d.common.close, table: d.common.showTable, chart: d.common.showChart }}
              >
                <div className="flex flex-col gap-1.5 p-2.5 pb-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-ink">{name}</span>
                    <span className="tabular shrink-0 text-sm font-semibold whitespace-nowrap text-ink">
                      {fmtValue(it.def, it.data.value, lang)}
                      {delta && (
                        <span className={clsx("ml-1.5 text-xs font-medium", dir === 0 || good === null ? "text-ink-2" : good ? "text-up" : "text-down")}>
                          {dir > 0 ? "▲" : dir < 0 ? "▼" : ""} {delta}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {it.reasons.map((r) => (
                      <span
                        key={r.kind}
                        className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-px text-[10px] text-ink-2"
                        title={r.kind === "move" ? t.moveTip.replace("{z}", fmtNumber(Math.abs(r.z), lang, 1)) : undefined}
                      >
                        {(r.kind === "crit" || r.kind === "warn") && (
                          <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", r.kind === "crit" ? "bg-critical" : "bg-warning")} />
                        )}
                        {r.kind === "move" ? (r.z > 0 ? t.reasons.moveUp : t.reasons.moveDown) : t.reasons[r.kind]}
                      </span>
                    ))}
                  </div>
                  <p className={clsx("text-xs leading-snug", it.note ? "text-ink" : "text-muted")}>{it.note?.text ?? pick(it.def.explain, lang)}</p>
                </div>
              </TileDetail>
              {it.note && it.note.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                  {it.note.sources.map((s, j) => (
                    <a key={j} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="rounded bg-surface px-1 text-[10px] text-ink-2 hover:text-ink">
                      {s.source}
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted">
        {t.rules}
        {!hasKey ? ` ${t.needsKey}` : latest && model ? ` · AI ${fmtTime(latest, lang)} · ${model}` : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- yield curve

export async function YieldCurvePanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const curve = await getYieldCurve();
  if (!curve.rows.length) return <EmptyState lang={lang} />;
  const [spread] = (await getTiles(["curve"])).map((t) => t.data);
  const label = (base: string, ts: number | null) => (ts ? `${base} (${fmtDate(ts, lang)})` : base);
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
      {spread && (
        <p className="text-xs text-ink-2">
          {d.charts.spread2s10s}:{" "}
          <span className="tabular font-semibold text-ink">{fmtValue(SERIES.curve, spread.value, lang)} pp</span>{" "}
          <span className={clsx("ml-1 rounded px-1.5 py-0.5 text-[11px]", spread.value < 0 ? "bg-surface-2 text-down" : "bg-surface-2 text-ink-2")}>
            {spread.value < 0 ? d.charts.inverted : d.charts.normal}
          </span>{" "}
          <span className="text-muted">· {pick(SERIES.curve.explain, lang)}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- inflation vs policy rates

export async function InflationRatesPanel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const { year, rows } = await getCountryMacro(lang);
  if (rows.every((r) => r.inflation === null && r.rate === null)) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <DumbbellChart
        rows={rows.map((r) => ({ key: r.short, label: r.name, a: r.inflation, b: r.rate }))}
        a={{ label: d.charts.inflation.replace("{year}", String(year)), color: "var(--s1)" }}
        b={{ label: d.charts.policyRate, color: "var(--s2)" }}
        gapLabel={d.charts.realRate}
        gapHint={d.charts.realRateHint}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      <p className="text-[11px] text-muted">VN: {d.charts.noRateVn}.</p>
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

export async function RegimeBadge({ lang }: { lang: Locale }) {
  const t = getDict(lang).regime;
  const r = await getRegime();
  const label = r.regime === "risk-on" ? t.riskOn : r.regime === "risk-off" ? t.riskOff : r.regime === "neutral" ? t.neutral : t.unknown;
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
        <span aria-hidden className={clsx("inline-block size-2 rounded-full", REGIME_STYLE[r.regime])} />
        <span className="hidden sm:inline">{t.title}:</span>
        <span className="font-semibold text-ink">{label}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg">
        <p className="mb-2 text-ink-2">{t.explain}</p>
        {r.score !== null && (
          <p className="mb-2">
            {t.score}: <span className="tabular font-semibold text-ink">{fmtNumber(r.score, lang, 2)}</span>
            {r.override && <span className="ml-1 text-down">({r.override})</span>}
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {r.components.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2">
              <span className="text-ink-2">{t.components[c.key]}</span>
              <span className={clsx("tabular font-medium", c.z > 0.5 ? "text-down" : c.z < -0.5 ? "text-up" : "text-ink")}>
                z {c.z > 0 ? "+" : ""}
                {fmtNumber(c.z, lang, 2)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">≤ −0.5 → {t.riskOn} · ≥ +0.75 → {t.riskOff}</p>
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
    <div className="overflow-hidden border-t border-line text-xs" aria-label={getDict(lang).topbar.ticker}>
      <div className="ticker-track flex w-max py-1.5">
        {row}
        <span aria-hidden className="flex">
          {row}
        </span>
      </div>
    </div>
  );
}
