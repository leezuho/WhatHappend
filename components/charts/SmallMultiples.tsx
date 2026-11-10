"use client";

import { useState, type PointerEvent } from "react";
import clsx from "clsx";

// One small line chart per country on a shared time axis and (by default) a
// shared value scale, so heights compare across cells. Hovering any cell moves one
// crosshair through all of them and every header reads that month. Thin lines,
// recessive reference line, end dot in the series color; a table view carries
// the same numbers for screen readers and exact reading.

type Status = "good" | "warn" | "crit";

export interface MultipleRow {
  key: string;
  label: string;
  /** Oldest first, stamped at the period's first day (UTC). */
  points: { ts: number; value: number }[];
  /** Optional second line on the same scale (series[1]). */
  points2?: { ts: number; value: number }[];
  /** This row's own reference level (a country's inflation target); overrides the shared `refValue`. */
  refValue?: number;
  status?: Status | null;
  /** One short line under the plot, e.g. "GDP Q2/26: +1.8%". */
  note?: string;
}

interface Props {
  rows: MultipleRow[];
  /** One or two series, in categorical slot order. */
  series: { label: string; color: string }[];
  freq: "m" | "q";
  digits: number;
  unit: "%" | "";
  /** Shared reference level drawn in every cell (100 = trend, 0). */
  refValue?: number;
  /** Legend text for the reference line. */
  refLabel?: string;
  /**
   * Give each cell its own value scale, at least this wide in value units, when levels differ too much for
   * one scale (policy rates from 0.75% to 15%) and the story is each line's direction. Default: one shared scale.
   */
  ownScale?: number;
  locale: "vi" | "en";
  labels: {
    table: string;
    chart: string;
    country: string;
    period: string;
    scale: string;
    ownScale: string;
    status?: Record<Status, string>;
  };
  /** Plot height in px. */
  height?: number;
  className?: string;
}

const STATUS_DOT: Record<Status, string> = {
  good: "bg-good",
  warn: "bg-warning",
  crit: "bg-critical",
};

function periodLabel(ts: number, freq: "m" | "q", locale: "vi" | "en"): string {
  const d = new Date(ts);
  const yy = String(d.getUTCFullYear()).slice(2);
  if (freq === "q") {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return locale === "vi" ? `Q${q}/${yy}` : `Q${q} '${yy}`;
  }
  if (locale === "vi") return `T${d.getUTCMonth() + 1}/${yy}`;
  return `${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d)} '${yy}`;
}

/** Value range with 8% headroom; widened around its middle to `minSpan` when narrower. */
function domainOf(values: number[], minSpan = 0): { lo: number; hi: number } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo || 1) * 0.08;
  return { lo: lo - pad, hi: hi + pad };
}

export function SmallMultiples({ rows, series, freq, digits, unit, refValue, refLabel, ownScale, locale, labels, height = 56, className }: Props) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const fmt = (v: number) => `${new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)}${unit}`;

  const all = rows.flatMap((r) => [...r.points, ...(r.points2 ?? [])]);
  if (!all.length) return null;
  const stamps = [...new Set(all.map((p) => p.ts))].sort((a, b) => a - b);
  const t0 = stamps[0];
  const t1 = stamps[stamps.length - 1];
  const refs = rows.map((r) => r.refValue ?? refValue).filter((v): v is number => v !== undefined);
  const values = [...all.map((p) => p.value), ...refs];
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const shared = domainOf(values);
  const domainOfRow = (r: MultipleRow) => {
    if (ownScale === undefined) return shared;
    const ref = r.refValue ?? refValue;
    return domainOf([...r.points, ...(r.points2 ?? [])].map((p) => p.value).concat(ref === undefined ? [] : [ref]), ownScale);
  };
  const x = (ts: number) => (t1 === t0 ? 50 : ((ts - t0) / (t1 - t0)) * 100);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - box.left) / box.width) * (t1 - t0);
    let best = stamps[0];
    for (const s of stamps) if (Math.abs(s - t) < Math.abs(best - t)) best = s;
    setHover(best);
  };

  const lines = (r: MultipleRow) => [r.points, r.points2 ?? []].slice(0, series.length);

  return (
    <figure className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {series.length > 1 &&
            series.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          {refLabel && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-3 border-t border-dashed border-ink-2" />
              {refLabel}
            </li>
          )}
          <li className="text-muted">{ownScale === undefined ? `${labels.scale}: ${fmt(vMin)} → ${fmt(vMax)}` : labels.ownScale}</li>
        </ul>
        <button type="button" onClick={() => setTable((t) => !t)} className="shrink-0 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {table ? labels.chart : labels.table}
        </button>
      </div>

      {table ? (
        <div className="scroll-thin max-h-[420px] overflow-auto">
          <table className="tabular w-full text-xs">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th scope="col" className="py-1 pr-2 text-left font-normal">
                  {labels.country}
                </th>
                {series.map((s) => (
                  <th key={s.label} scope="col" className="py-1 pr-2 text-right font-normal">
                    {s.label}
                  </th>
                ))}
                <th scope="col" className="py-1 pr-2 text-right font-normal">
                  {labels.period}
                </th>
                {rows.some((r) => r.note) && <th className="py-1 text-left font-normal" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lastTs = r.points[r.points.length - 1]?.ts;
                return (
                  <tr key={r.key} className="border-t border-line">
                    <th scope="row" className="py-1 pr-2 text-left font-normal text-ink-2">
                      {r.label}
                    </th>
                    {lines(r).map((pts, i) => {
                      const last = pts[pts.length - 1];
                      return (
                        <td key={i} className="py-1 pr-2 text-right text-ink">
                          {last ? fmt(last.value) : "—"}
                          {i === 0 && r.status && labels.status && <span className="ml-1 text-[10px] text-muted">({labels.status[r.status]})</span>}
                        </td>
                      );
                    })}
                    <td className="py-1 pr-2 text-right text-muted">{lastTs !== undefined ? periodLabel(lastTs, freq, locale) : "—"}</td>
                    {rows.some((x) => x.note) && <td className="py-1 text-ink-2">{r.note}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {rows.map((r) => {
            const sets = lines(r);
            const { lo, hi } = domainOfRow(r);
            const y = (v: number) => ((hi - v) / (hi - lo)) * height;
            const path = (pts: { ts: number; value: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(2)},${y(p.value).toFixed(2)}`).join("");
            const at = (pts: { ts: number; value: number }[]) => (hover === null ? pts[pts.length - 1] : pts.find((p) => p.ts === hover));
            const head = at(sets[0]);
            const lastTs = sets[0][sets[0].length - 1]?.ts;
            const rowRef = r.refValue ?? refValue;
            const summary = [
              r.label,
              head ? fmt(head.value) : "—",
              lastTs !== undefined ? periodLabel(head?.ts ?? lastTs, freq, locale) : null,
              r.status && labels.status?.[r.status],
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={r.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-1.5">
                  <span className="truncate text-xs text-ink-2" title={r.label}>
                    {r.label}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1">
                    {r.status && hover === null && (
                      <span
                        aria-hidden
                        title={labels.status?.[r.status]}
                        className={clsx("inline-block size-1.5 self-center rounded-full", STATUS_DOT[r.status])}
                      />
                    )}
                    <span className="tabular text-xs font-semibold text-ink">{head ? fmt(head.value) : "—"}</span>
                    {sets[1] && hover !== null && at(sets[1]) && <span className="tabular text-[10px] text-ink-2">{fmt(at(sets[1])!.value)}</span>}
                    <span className="tabular text-[10px] text-muted">{head ? periodLabel(head.ts, freq, locale) : ""}</span>
                  </span>
                </div>
                <div
                  className="relative mt-1 touch-none"
                  style={{ height }}
                  role="img"
                  aria-label={summary}
                  onPointerMove={onMove}
                  onPointerLeave={() => setHover(null)}
                >
                  <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
                    <line x1={0} x2={100} y1={height} y2={height} stroke="var(--grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    {rowRef !== undefined && (
                      <line
                        x1={0}
                        x2={100}
                        y1={y(rowRef)}
                        y2={y(rowRef)}
                        stroke="var(--ink-2)"
                        strokeOpacity={0.55}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {sets.map((pts, i) =>
                      pts.length > 1 ? (
                        <path
                          key={i}
                          d={path(pts)}
                          fill="none"
                          stroke={series[i].color}
                          strokeWidth={i ? 1.25 : 1.75}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null,
                    )}
                  </svg>
                  {hover !== null && <span aria-hidden className="absolute top-0 bottom-0 w-px bg-axis" style={{ left: `${x(hover)}%` }} />}
                  {sets.map((pts, i) => {
                    const p = at(pts);
                    return p ? (
                      <span
                        key={i}
                        aria-hidden
                        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                        style={{
                          left: `${x(p.ts)}%`,
                          top: `${(y(p.value) / height) * 100}%`,
                          background: series[i].color,
                        }}
                      />
                    ) : null;
                  })}
                </div>
                {r.note && <div className="mt-1 truncate text-[10px] text-muted">{r.note}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
