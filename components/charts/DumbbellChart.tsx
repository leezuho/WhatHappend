"use client";

import { useState } from "react";
import clsx from "clsx";

export interface DumbbellRow {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
}

interface Props {
  rows: DumbbellRow[];
  /** Series a and b: names and categorical slots ("var(--s1)"), in slot order. */
  a: { label: string; color: string };
  b: { label: string; color: string };
  /** Name of b − a, printed as the right-hand column. */
  gapLabel: string;
  gapHint: string;
  locale: "vi" | "en";
  tableLabels: { table: string; chart: string };
}

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

// One row per entity, two dots on a shared axis and the hairline between them:
// the length of the line is the story (here, the real policy rate).
export function DumbbellChart({ rows, a, b, gapLabel, gapHint, locale, tableLabels }: Props) {
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const fmt = (v: number, signed = false) =>
    `${signed && v > 0 ? "+" : signed && v < 0 ? "−" : ""}${new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(signed ? Math.abs(v) : v)}%`;

  const gap = (r: DumbbellRow) => (r.a !== null && r.b !== null ? r.b - r.a : null);
  const sorted = [...rows].sort((x, y) => (gap(y) ?? -Infinity) - (gap(x) ?? -Infinity));
  const all = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v !== null);
  const lo0 = Math.min(0, ...all);
  const hi0 = Math.max(...all, 1);
  const stepV = niceStep(hi0 - lo0);
  const lo = Math.floor(lo0 / stepV) * stepV;
  const hi = Math.ceil(hi0 / stepV) * stepV;
  const ticks = Array.from({ length: Math.round((hi - lo) / stepV) + 1 }, (_, i) => lo + i * stepV);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const fmtTick = (v: number) => `${new Intl.NumberFormat(loc, { maximumFractionDigits: Number.isInteger(stepV) ? 0 : 1 }).format(v)}%`;
  const grid = "grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_3.5rem] items-center gap-x-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_5rem] sm:gap-x-3";

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {[a, b].map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded bg-muted/60" />
            {gapLabel} = {gapHint}
          </li>
        </ul>
        <button type="button" onClick={() => setTable((t) => !t)} className="shrink-0 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {table ? tableLabels.chart : tableLabels.table}
        </button>
      </div>

      {table ? (
        <table className="tabular w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-2 font-normal" />
              <th className="py-1 pr-2 text-right font-normal">{a.label}</th>
              <th className="py-1 pr-2 text-right font-normal">{b.label}</th>
              <th className="py-1 text-right font-normal">{gapLabel}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const g = gap(r);
              return (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">{r.label}</td>
                  <td className="py-1 pr-2 text-right text-ink">{r.a === null ? "—" : fmt(r.a)}</td>
                  <td className="py-1 pr-2 text-right text-ink">{r.b === null ? "—" : fmt(r.b)}</td>
                  <td className={clsx("py-1 text-right font-medium", g !== null && g < 0 ? "text-down" : "text-ink")}>{g === null ? "—" : fmt(g, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col" onMouseLeave={() => setActive(null)}>
          <div className={clsx(grid, "pb-1 text-[11px] text-muted")}>
            <span />
            {/* Spans the plot too, so a long name never truncates in the narrow value column. */}
            <span className="col-span-2 text-right">{gapLabel}</span>
          </div>
          {sorted.map((r) => {
            const g = gap(r);
            const vals = [r.a, r.b].filter((v): v is number => v !== null);
            const on = active === r.key;
            const dim = active !== null && !on;
            return (
              <div
                key={r.key}
                tabIndex={0}
                onMouseEnter={() => setActive(r.key)}
                onFocus={() => setActive(r.key)}
                onBlur={() => setActive(null)}
                aria-label={`${r.label}: ${a.label} ${r.a === null ? "—" : fmt(r.a)}, ${b.label} ${r.b === null ? "—" : fmt(r.b)}${g === null ? "" : `, ${gapLabel} ${fmt(g, true)}`}`}
                className={clsx(grid, "h-7 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-s1", on && "bg-surface-2")}
              >
                <span className={clsx("truncate pl-1 text-xs", on ? "text-ink" : "text-ink-2")}>{r.label}</span>
                <span className="relative h-full">
                  {ticks.map((t) => (
                    <span key={t} aria-hidden className={clsx("absolute inset-y-0 w-px", t === 0 ? "bg-axis" : "bg-grid")} style={{ left: `${pos(t)}%` }} />
                  ))}
                  {vals.length === 2 && (
                    <span
                      aria-hidden
                      className={clsx("absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-opacity", on ? "bg-ink-2" : "bg-muted/60", dim && "opacity-40")}
                      style={{ left: `${pos(Math.min(...vals))}%`, width: `${pos(Math.max(...vals)) - pos(Math.min(...vals))}%` }}
                    />
                  )}
                  {(
                    [
                      [r.a, a.color],
                      [r.b, b.color],
                    ] as const
                  ).map(([v, color], i) =>
                    v === null ? null : (
                      <span
                        key={i}
                        aria-hidden
                        className={clsx(
                          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-[opacity,width,height]",
                          on ? "size-3" : "size-2.5",
                          dim && "opacity-40",
                        )}
                        style={{ left: `${pos(v)}%`, background: color }}
                      />
                    ),
                  )}
                  {on && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
                      style={{ left: `${Math.min(80, Math.max(20, pos(vals.length ? (Math.min(...vals) + Math.max(...vals)) / 2 : 0)))}%` }}
                    >
                      <span className="mb-0.5 block text-muted">{r.label}</span>
                      {(
                        [
                          [r.a, a],
                          [r.b, b],
                        ] as const
                      ).map(([v, s]) => (
                        <span key={s.label} className="flex items-center gap-2">
                          <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                          <span className="tabular font-semibold text-ink">{v === null ? "—" : fmt(v)}</span>
                          <span className="text-ink-2">{s.label}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className={clsx("tabular text-right text-xs font-semibold", g === null ? "text-muted" : g < 0 ? "text-down" : "text-ink")}>
                  {g === null ? "—" : fmt(g, true)}
                </span>
              </div>
            );
          })}
          <div className={clsx(grid, "pt-1 text-[11px] text-muted")}>
            <span />
            <span className="relative h-3">
              {ticks.map((t) => (
                <span key={t} className="tabular absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>
                  {fmtTick(t)}
                </span>
              ))}
            </span>
            <span />
          </div>
        </div>
      )}
    </figure>
  );
}
