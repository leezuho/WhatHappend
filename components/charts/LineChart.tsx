"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export interface ChartSeries {
  key: string;
  label: string;
  /** CSS color, normally a categorical slot: "var(--s1)". Slots are assigned in order, never cycled. */
  color: string;
}

export type XFormat = "day" | "month" | "year" | "category";

interface Props {
  data: Record<string, number | string | null>[];
  xKey: string;
  series: ChartSeries[];
  height?: number;
  xFormat: XFormat;
  yDigits?: number;
  ySuffix?: string;
  locale: "vi" | "en";
  /** Soft ~10% wash under the first series (the one the story is about). */
  area?: boolean;
  /** Horizontal reference line, e.g. 0 for the yield-curve spread. */
  refY?: number;
  /** Watch / danger bands behind the line, in the reserved status colors (the footnote names them). */
  zones?: { dir: "above" | "below"; warn: number; crit?: number };
  tableLabels: { table: string; chart: string };
}

function fmtX(v: number | string, f: XFormat, locale: string) {
  if (f === "category" || typeof v === "string") return String(v);
  const opts: Intl.DateTimeFormatOptions =
    f === "day" ? { day: "numeric", month: "short" } : f === "month" ? { month: "short", year: "2-digit" } : { year: "numeric" };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(v);
}

export function LineChart({ data, xKey, series, height = 200, xFormat, yDigits = 2, ySuffix = "", locale, area, refY, zones, tableLabels }: Props) {
  const [table, setTable] = useState(false);
  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const fmtY = (v: number) => `${new Intl.NumberFormat(loc, { maximumFractionDigits: yDigits, minimumFractionDigits: yDigits }).format(v)}${ySuffix}`;
  // Open-ended bands need an explicit far edge: Recharts reads an omitted y1/y2 as the bottom of the plot,
  // not "to the edge in that direction". Anything past the data is clipped away by ifOverflow="hidden".
  const far = (() => {
    if (!zones) return { lo: 0, hi: 0 };
    const vals = data.flatMap((r) => series.map((s) => r[s.key])).filter((v): v is number => typeof v === "number");
    const marks = [zones.warn, zones.crit ?? zones.warn];
    const lo = Math.min(...vals, ...marks);
    const hi = Math.max(...vals, ...marks);
    const pad = hi - lo || 1;
    return { lo: lo - pad, hi: hi + pad };
  })();

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => setTable((t) => !t)} className="text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {table ? tableLabels.chart : tableLabels.table}
        </button>
      </div>
      {table ? (
        <div className="scroll-thin overflow-auto" style={{ maxHeight: height }}>
          <table className="tabular w-full text-xs">
            <thead className="sticky top-0 bg-surface text-left text-muted">
              <tr>
                <th className="py-1 pr-2 font-normal" />
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-2 text-right font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">{fmtX(row[xKey] as number | string, xFormat, loc)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-2 text-right text-ink">
                      {typeof row[s.key] === "number" ? fmtY(row[s.key] as number) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
              <XAxis
                dataKey={xKey}
                type={xFormat === "category" ? "category" : "number"}
                domain={["dataMin", "dataMax"]}
                scale={xFormat === "category" ? "auto" : "time"}
                tickFormatter={(v) => fmtX(v, xFormat, loc)}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => fmtY(v)}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={["auto", "auto"]}
              />
              {zones && (
                <>
                  {/* "hidden" clips a band that only partly fits and drops one that is off the plot. */}
                  <ReferenceArea
                    y1={zones.dir === "above" ? zones.warn : (zones.crit ?? far.lo)}
                    y2={zones.dir === "above" ? (zones.crit ?? far.hi) : zones.warn}
                    fill="var(--warning)"
                    fillOpacity={0.1}
                    stroke="none"
                    ifOverflow="hidden"
                  />
                  {zones.crit !== undefined && (
                    <ReferenceArea
                      y1={zones.dir === "above" ? zones.crit : far.lo}
                      y2={zones.dir === "above" ? far.hi : zones.crit}
                      fill="var(--critical)"
                      fillOpacity={0.1}
                      stroke="none"
                      ifOverflow="hidden"
                    />
                  )}
                  <ReferenceLine y={zones.warn} stroke="var(--warning)" strokeWidth={1} ifOverflow="hidden" />
                </>
              )}
              {refY !== undefined && <ReferenceLine y={refY} stroke="var(--axis)" strokeWidth={1} />}
              <Tooltip
                cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                content={(props: TooltipContentProps<ValueType, NameType>) => (
                  <ChartTooltip {...props} series={series} fmtY={fmtY} fmtXLabel={(v) => fmtX(v, xFormat, loc)} />
                )}
              />
              {area && (
                <Area dataKey={series[0].key} fill={series[0].color} fillOpacity={0.1} stroke="none" isAnimationActive={false} />
              )}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                  type="monotone"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  fmtY,
  fmtXLabel,
}: TooltipContentProps<ValueType, NameType> & { series: ChartSeries[]; fmtY: (v: number) => string; fmtXLabel: (v: number | string) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number | null>;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-sm">
      <div className="mb-1 text-muted">{fmtXLabel(label as number | string)}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
          <span className="tabular font-semibold text-ink">{typeof row[s.key] === "number" ? fmtY(row[s.key] as number) : "—"}</span>
          <span className="text-ink-2">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
