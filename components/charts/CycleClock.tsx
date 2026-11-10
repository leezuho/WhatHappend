"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export type Phase = "expansion" | "slowdown" | "downturn" | "recovery";

export interface ClockRowView {
  key: string;
  /** Short code drawn next to the dot (US, EA…). */
  label: string;
  name: string;
  phase: Phase;
  /** Oldest first; the last point is the latest month. gap = CLI − 100, momentum = 3-month change. */
  trail: { ts: number; gap: number; momentum: number }[];
}

interface Props {
  rows: ClockRowView[];
  locale: "vi" | "en";
  labels: {
    phases: Record<Phase, string>;
    phaseHints: Record<Phase, string>;
    axisGap: string;
    axisMomentum: string;
    trail: string;
    country: string;
    phase: string;
    cliLevel: string;
    momentum: string;
    table: string;
    chart: string;
  };
}

const PHASE_ORDER: Phase[] = ["expansion", "slowdown", "downturn", "recovery"];
const M = { top: 10, right: 12, bottom: 22, left: 40 };
const LABEL_H = 12;
const CHAR_W = 6.6;

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

/** Half-width of a symmetric domain around zero that fits every value, rounded out to a tick. */
function extent(values: number[]): { max: number; step: number } {
  const raw = Math.max(0.4, ...values.map(Math.abs)) * 1.12;
  const step = niceStep(raw * 2);
  return { max: Math.ceil(raw / step) * step, step };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A scatter of economies on two centred axes: above/below trend (CLI − 100)
// against momentum (3-month change). The quadrant is the phase; the tail shows
// how each economy got there. One hue for every dot: position carries the
// meaning, the code label carries identity.
export function CycleClock({ rows, locale, labels }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const fmt = (v: number, digits = 1, signed = false) =>
    `${signed && v > 0 ? "+" : signed && v < 0 ? "−" : ""}${new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(signed ? Math.abs(v) : v)}`;
  const fmtMonth = (ts: number) => new Intl.DateTimeFormat(loc, { month: "short", year: "numeric", timeZone: "UTC" }).format(ts);

  const all = rows.flatMap((r) => r.trail);
  const xs = extent(all.map((p) => p.momentum));
  const ys = extent(all.map((p) => p.gap));
  const height = Math.round(Math.min(440, Math.max(280, width * 0.62)));
  const iw = Math.max(0, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const px = (v: number) => M.left + ((v + xs.max) / (2 * xs.max)) * iw;
  const py = (v: number) => M.top + ((ys.max - v) / (2 * ys.max)) * ih;
  const ticks = (e: { max: number; step: number }) => Array.from({ length: Math.round((2 * e.max) / e.step) + 1 }, (_, i) => -e.max + i * e.step);

  // Greedy label placement: right, left, above, below the dot, first spot free of other labels and dots.
  const placed: Box[] = rows.map((r) => {
    const p = r.trail[r.trail.length - 1];
    return { x: px(p.momentum) - 6, y: py(p.gap) - 6, w: 12, h: 12 };
  });
  const labelPos = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
  for (const r of rows) {
    const p = r.trail[r.trail.length - 1];
    const cx = px(p.momentum);
    const cy = py(p.gap);
    const w = r.label.length * CHAR_W;
    const options = [
      { box: { x: cx + 8, y: cy - LABEL_H / 2, w, h: LABEL_H }, pos: { x: cx + 8, y: cy + 4, anchor: "start" as const } },
      { box: { x: cx - 8 - w, y: cy - LABEL_H / 2, w, h: LABEL_H }, pos: { x: cx - 8, y: cy + 4, anchor: "end" as const } },
      { box: { x: cx - w / 2, y: cy - 8 - LABEL_H, w, h: LABEL_H }, pos: { x: cx, y: cy - 10, anchor: "middle" as const } },
      { box: { x: cx - w / 2, y: cy + 8, w, h: LABEL_H }, pos: { x: cx, y: cy + 18, anchor: "middle" as const } },
    ];
    const free = options.find((o) => !placed.some((b) => overlaps(o.box, b))) ?? options[0];
    placed.push(free.box);
    labelPos.set(r.key, free.pos);
  }

  const activeRow = rows.find((r) => r.key === active) ?? null;
  const ordered = [...rows].sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || b.trail.at(-1)!.gap - a.trail.at(-1)!.gap);
  const describe = (r: ClockRowView) => {
    const p = r.trail[r.trail.length - 1];
    return `${r.name}: ${labels.phases[r.phase]} (${labels.phaseHints[r.phase]}). ${labels.cliLevel} ${fmt(p.gap + 100)}, ${labels.momentum} ${fmt(p.momentum, 2, true)}, ${fmtMonth(p.ts)}`;
  };

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-2">
          <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full bg-s1 align-[-1px]" />
          {labels.trail}
        </p>
        <button type="button" onClick={() => setTable((t) => !t)} className="shrink-0 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {table ? labels.chart : labels.table}
        </button>
      </div>

      {table ? (
        <table className="tabular w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-2 font-normal">{labels.country}</th>
              <th className="py-1 pr-2 text-right font-normal">{labels.cliLevel}</th>
              <th className="py-1 pr-2 text-right font-normal">{labels.momentum}</th>
              <th className="py-1 font-normal">{labels.phase}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => {
              const p = r.trail[r.trail.length - 1];
              return (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">{r.name}</td>
                  <td className="py-1 pr-2 text-right text-ink">{fmt(p.gap + 100)}</td>
                  <td className="py-1 pr-2 text-right text-ink">{fmt(p.momentum, 2, true)}</td>
                  <td className="py-1 text-ink-2" title={labels.phaseHints[r.phase]}>
                    {labels.phases[r.phase]} <span className="text-muted">· {fmtMonth(p.ts)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div ref={wrap} className="relative w-full" style={{ height }} onMouseLeave={() => setActive(null)}>
            {width > 0 && (
              <svg width={width} height={height} role="img" aria-label={`${labels.axisGap}; ${labels.axisMomentum}`} className="block overflow-visible">
                {/* grid */}
                {ticks(xs).map((t) => (
                  <line key={`x${t}`} x1={px(t)} x2={px(t)} y1={M.top} y2={M.top + ih} stroke="var(--grid)" strokeWidth={1} />
                ))}
                {ticks(ys).map((t) => (
                  <line key={`y${t}`} x1={M.left} x2={M.left + iw} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth={1} />
                ))}
                {/* the two zero lines split the plane into the four phases */}
                <line x1={px(0)} x2={px(0)} y1={M.top} y2={M.top + ih} stroke="var(--axis)" strokeWidth={1.5} />
                <line x1={M.left} x2={M.left + iw} y1={py(0)} y2={py(0)} stroke="var(--axis)" strokeWidth={1.5} />
                {(
                  [
                    ["expansion", M.left + iw - 6, M.top + 14, "end"],
                    ["slowdown", M.left + 6, M.top + 14, "start"],
                    ["downturn", M.left + 6, M.top + ih - 8, "start"],
                    ["recovery", M.left + iw - 6, M.top + ih - 8, "end"],
                  ] as const
                ).map(([ph, x, y, anchor]) => (
                  <text key={ph} x={x} y={y} textAnchor={anchor} className="fill-muted text-[11px] font-semibold tracking-wide uppercase">
                    {labels.phases[ph]}
                  </text>
                ))}
                {/* ticks */}
                {ticks(xs).map((t) => (
                  <text key={`xt${t}`} x={px(t)} y={M.top + ih + 14} textAnchor="middle" className="tabular fill-muted text-[10px]">
                    {fmt(t, xs.step < 0.1 ? 2 : 1, true)}
                  </text>
                ))}
                {ticks(ys).map((t) => (
                  <text key={`yt${t}`} x={M.left - 6} y={py(t) + 3} textAnchor="end" className="tabular fill-muted text-[10px]">
                    {fmt(t, ys.step < 0.1 ? 2 : 1, true)}
                  </text>
                ))}

                {/* tails, then dots on top */}
                {rows.map((r) => {
                  const on = active === r.key;
                  return (
                    <polyline
                      key={`t${r.key}`}
                      points={r.trail.map((p) => `${px(p.momentum)},${py(p.gap)}`).join(" ")}
                      fill="none"
                      stroke={on ? "var(--s1)" : "var(--axis)"}
                      strokeWidth={on ? 2 : 1.25}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={active && !on ? 0.25 : 1}
                    />
                  );
                })}
                {activeRow?.trail.slice(0, -1).map((p) => <circle key={p.ts} cx={px(p.momentum)} cy={py(p.gap)} r={2.5} fill="var(--s1)" />)}
                {rows.map((r) => {
                  const p = r.trail[r.trail.length - 1];
                  const lp = labelPos.get(r.key)!;
                  const on = active === r.key;
                  const dim = active !== null && !on;
                  return (
                    <g
                      key={r.key}
                      tabIndex={0}
                      role="button"
                      aria-label={describe(r)}
                      onMouseEnter={() => setActive(r.key)}
                      onFocus={() => setActive(r.key)}
                      onBlur={() => setActive(null)}
                      className="cursor-default outline-none"
                      opacity={dim ? 0.3 : 1}
                    >
                      <circle cx={px(p.momentum)} cy={py(p.gap)} r={12} fill="transparent" />
                      <circle cx={px(p.momentum)} cy={py(p.gap)} r={on ? 6 : 5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
                      <text x={lp.x} y={lp.y} textAnchor={lp.anchor} className={clsx("text-[11px] font-medium", on ? "fill-ink" : "fill-ink-2")}>
                        {r.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {activeRow && <ClockTooltip row={activeRow} x={px(activeRow.trail.at(-1)!.momentum)} y={py(activeRow.trail.at(-1)!.gap)} width={width} labels={labels} fmt={fmt} fmtMonth={fmtMonth} />}
          </div>
          <PhaseList rows={rows} labels={labels} active={active} setActive={setActive} fmt={fmt} />
        </div>
      )}
      {!table && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
          <span>↑ {labels.axisGap}</span>
          <span>→ {labels.axisMomentum}</span>
        </figcaption>
      )}
    </figure>
  );
}

function ClockTooltip({
  row,
  x,
  y,
  width,
  labels,
  fmt,
  fmtMonth,
}: {
  row: ClockRowView;
  x: number;
  y: number;
  width: number;
  labels: Props["labels"];
  fmt: (v: number, digits?: number, signed?: boolean) => string;
  fmtMonth: (ts: number) => string;
}) {
  const p = row.trail[row.trail.length - 1];
  const left = x > width / 2;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-sm"
      style={{ top: Math.max(0, y - 12), ...(left ? { right: width - x + 14 } : { left: x + 14 }) }}
    >
      <div className="font-semibold text-ink">{row.name}</div>
      <div className="mb-1 text-muted">{fmtMonth(p.ts)}</div>
      <div className="text-ink">
        {labels.phases[row.phase]} <span className="text-ink-2">· {labels.phaseHints[row.phase]}</span>
      </div>
      <div className="tabular mt-1 flex gap-3 text-ink-2">
        <span>
          {labels.cliLevel} <span className="font-semibold text-ink">{fmt(p.gap + 100)}</span>
        </span>
        <span>
          {labels.momentum} <span className="font-semibold text-ink">{fmt(p.momentum, 2, true)}</span>
        </span>
      </div>
    </div>
  );
}

/** The same positions as text: economies grouped by phase, each with its CLI and direction. Hovering one lights it up in the chart. */
function PhaseList({
  rows,
  labels,
  active,
  setActive,
  fmt,
}: {
  rows: ClockRowView[];
  labels: Props["labels"];
  active: string | null;
  setActive: (key: string | null) => void;
  fmt: (v: number, digits?: number, signed?: boolean) => string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 self-start sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {PHASE_ORDER.map((ph) => {
        const members = rows.filter((r) => r.phase === ph).sort((a, b) => b.trail.at(-1)!.gap - a.trail.at(-1)!.gap);
        return (
          <li key={ph} className="flex flex-col gap-1.5">
            <div>
              <span className="text-xs font-semibold text-ink">{labels.phases[ph]}</span>
              <span className="ml-1.5 text-[11px] text-muted">{labels.phaseHints[ph]}</span>
            </div>
            {members.length ? (
              <div className="flex flex-wrap gap-1.5">
                {members.map((r) => {
                  const p = r.trail[r.trail.length - 1];
                  return (
                    <span
                      key={r.key}
                      onMouseEnter={() => setActive(r.key)}
                      onMouseLeave={() => setActive(null)}
                      title={r.name}
                      className={clsx("tabular rounded-md px-1.5 py-0.5 text-[11px]", active === r.key ? "bg-s1 text-on-accent" : "bg-surface-2 text-ink-2")}
                    >
                      <span className="font-semibold">{r.label}</span> {fmt(p.gap + 100)} {p.momentum >= 0 ? "▲" : "▼"}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] text-muted">—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
