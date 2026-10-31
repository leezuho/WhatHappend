"use client";

import { useState } from "react";
import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { ChartSeries } from "./LineChart";

interface Props {
  data: Record<string, number | string | null>[];
  xKey: string;
  /** Long name per x value for tooltips and the table. */
  xLabelKey?: string;
  series: ChartSeries[];
  height?: number;
  yDigits?: number;
  ySuffix?: string;
  locale: "vi" | "en";
  tableLabels: { table: string; chart: string };
}

// Grouped columns: <=24px thick, 4px rounded data-end, square at the baseline,
// 2px surface gap between neighbours.
export function BarChart({ data, xKey, xLabelKey, series, height = 220, yDigits = 1, ySuffix = "%", locale, tableLabels }: Props) {
  const [table, setTable] = useState(false);
  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const fmtY = (v: number) => `${new Intl.NumberFormat(loc, { maximumFractionDigits: yDigits, minimumFractionDigits: yDigits }).format(v)}${ySuffix}`;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
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
              {data.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">{String(row[xLabelKey ?? xKey])}</td>
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
            <RBarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey={xKey} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={0} />
              <YAxis tickFormatter={(v: number) => fmtY(v)} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={(p: TooltipContentProps<ValueType, NameType>) => {
                  if (!p.active || !p.payload?.length) return null;
                  const row = p.payload[0].payload as Record<string, number | string | null>;
                  return (
                    <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-sm">
                      <div className="mb-1 text-muted">{String(row[xLabelKey ?? xKey])}</div>
                      {series.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
                          <span className="tabular font-semibold text-ink">{typeof row[s.key] === "number" ? fmtY(row[s.key] as number) : "—"}</span>
                          <span className="text-ink-2">{s.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </RBarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
