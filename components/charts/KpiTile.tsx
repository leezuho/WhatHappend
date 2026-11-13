import type { ReactNode } from "react";
import clsx from "clsx";
import type { SeriesDef } from "@/config/series";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDelta, fmtPeriod, fmtValue } from "@/lib/format";
import type { TileData } from "@/lib/data/series";
import { alertOf } from "@/lib/signals/notable";
import { Sparkline } from "./Sparkline";

/** `footer`: what makes the reading stand out (vital signs), under the range bar. */
export function KpiTile({ def, data, locale, footer }: { def: SeriesDef; data: TileData | null; locale: Locale; footer?: ReactNode }) {
  const name = pick(def.name, locale);
  const d = getDict(locale);
  if (!data) {
    return (
      <div className="flex h-full min-h-[104px] flex-col justify-between rounded-lg bg-surface-2/60 p-3">
        <span className="text-xs text-ink-2">{name}</span>
        <span className="text-lg font-semibold text-muted">—</span>
      </div>
    );
  }
  const alert = alertOf(def, data.value);
  const delta = fmtDelta(def, data, locale);
  const dir = (def.delta === "abs" ? data.change : data.changePct) ?? 0;
  const good = def.polarity === "neutral" ? null : (dir > 0) === (def.polarity === "up-good");
  return (
    <div
      className={clsx(
        "relative flex h-full min-h-[104px] flex-col gap-1.5 rounded-lg p-3",
        alert ? "bg-surface-2 ring-1 ring-inset" : "bg-surface-2/60",
        alert === "crit" ? "ring-critical" : alert === "warn" ? "ring-warning" : "",
      )}
      title={pick(def.explain, locale)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-ink-2">{name}</span>
        {alert && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-ink-2">
            <span aria-hidden className={clsx("inline-block size-2 rounded-full", alert === "crit" ? "bg-critical" : "bg-warning")} />
            {d.highlights.reasons[alert]}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[22px] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink">{fmtValue(def, data.value, locale)}</span>
        {delta && (
          <span className={clsx("tabular text-xs font-medium whitespace-nowrap", dir === 0 || good === null ? "text-ink-2" : good ? "text-up" : "text-down")}>
            {dir > 0 ? "▲" : dir < 0 ? "▼" : ""} {delta}
          </span>
        )}
        {def.freq && (
          <span className="text-[11px] whitespace-nowrap text-muted" title={d.charts.period}>
            {fmtPeriod(data.ts, def.freq, locale)}
          </span>
        )}
      </div>
      <Sparkline points={data.spark} height={34} fluid trend={def.price} label={`${name}, ${d.charts.spark[def.freq ?? "d"]}`} />
      {data.range && <RangeBar def={def} value={data.value} range={data.range} locale={locale} />}
      {footer}
    </div>
  );
}

/** Where today sits between the 1-year low and high, marked by an accent dot. */
function RangeBar({ def, value, range, locale }: { def: SeriesDef; value: number; range: { lo: number; hi: number }; locale: Locale }) {
  const t = getDict(locale).charts;
  const pos = Math.min(100, Math.max(0, ((value - range.lo) / (range.hi - range.lo)) * 100));
  const lo = fmtValue(def, range.lo, locale);
  const hi = fmtValue(def, range.hi, locale);
  return (
    <div className="flex items-center gap-1.5 text-[10px] leading-none text-muted" title={`${t.range1y}: ${lo} → ${hi}`}>
      <span className="font-medium text-ink-2">{t.range1yShort}</span>
      <span className="tabular whitespace-nowrap">{lo}</span>
      <span className="relative h-1 min-w-6 flex-1 rounded-full bg-grid" role="img" aria-label={`${t.range1y}: ${lo} → ${hi}, ${Math.round(pos)}%`}>
        <span aria-hidden className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-s1 ring-2 ring-surface" style={{ left: `${pos.toFixed(1)}%` }} />
      </span>
      <span className="tabular whitespace-nowrap">{hi}</span>
    </div>
  );
}
