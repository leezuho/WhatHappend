"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

// One dot per economy on two measures, split into four named quadrants (growth vs
// inflation, debt vs deficit). Dots and labels are HTML placed in % of the plot, so
// text stays at its real size at any width and nothing needs measuring; trails are an
// SVG overlay stretched to the plot.

export interface ScatterPoint {
  key: string;
  /** Short code drawn next to the dot. */
  label: string;
  name: string;
  x: number;
  y: number;
  /** Earlier positions, oldest first, drawn as a fading tail into the dot. */
  trail?: { x: number; y: number }[];
  /** Series index: 0 → first categorical slot, 1 → second. */
  group: 0 | 1;
  /** Extra tooltip lines (periods, sources). */
  notes?: string[];
}

type Corner = "tl" | "tr" | "bl" | "br";

interface Props {
  points: ScatterPoint[];
  /** Where the quadrants meet. */
  split: { x: number; y: number };
  quadrants: Record<Corner, string>;
  /** Quadrant shaded as the risk zone. */
  danger?: Corner;
  x: { label: string; suffix: string; digits: number; signed?: boolean };
  y: { label: string; suffix: string; digits: number; signed?: boolean };
  /** Legend names of the two groups. */
  groups: [string, string];
  locale: "vi" | "en";
  height?: number;
  tableLabels: { table: string; chart: string; name: string };
}

const COLORS = ["var(--s1)", "var(--s2)"] as const;

function niceStep(span: number): number {
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

function axis(values: number[], split: number) {
  const lo0 = Math.min(split, ...values);
  const hi0 = Math.max(split, ...values);
  const step = niceStep(hi0 - lo0 || 1);
  // A quarter step of air past the outermost dot, so no dot or label sits on the frame.
  const lo = Math.floor((lo0 - step / 4) / step) * step;
  const hi = Math.ceil((hi0 + step / 4) / step) * step;
  const ticks: number[] = [];
  for (let i = 0; lo + i * step <= hi + 1e-9; i++) ticks.push(lo + i * step);
  return { lo, hi, ticks };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Greedy label placement in px: right of the dot, else left, above, below; a label that fits nowhere is
 * dropped (its dot still names itself on hover). Dots go first so no label covers one.
 */
export function placeLabels(pts: { key: string; label: string; cx: number; cy: number }[], width: number, height: number): Record<string, { dx: number; dy: number } | null> {
  const taken: Box[] = pts.map((p) => ({ x: p.cx - 6, y: p.cy - 6, w: 12, h: 12 }));
  const out: Record<string, { dx: number; dy: number } | null> = {};
  // Outliers first: they have room; the crowded middle takes what is left.
  const mx = pts.reduce((a, p) => a + p.cx, 0) / (pts.length || 1);
  const my = pts.reduce((a, p) => a + p.cy, 0) / (pts.length || 1);
  const order = [...pts].sort((a, b) => Math.hypot(b.cx - mx, b.cy - my) - Math.hypot(a.cx - mx, a.cy - my));
  for (const p of order) {
    const w = p.label.length * 6.4 + 2;
    const h = 12;
    const own = (b: Box) => b.x === p.cx - 6 && b.y === p.cy - 6;
    const tries = [
      { dx: 8, dy: -6 },
      { dx: -8 - w, dy: -6 },
      { dx: -w / 2, dy: -19 },
      { dx: -w / 2, dy: 7 },
    ];
    const fit = tries.find(({ dx, dy }) => {
      const b = { x: p.cx + dx, y: p.cy + dy, w, h };
      return b.x >= 0 && b.y >= 0 && b.x + w <= width && b.y + h <= height && !taken.some((t) => !own(t) && overlaps(t, b));
    });
    out[p.key] = fit ?? null;
    if (fit) taken.push({ x: p.cx + fit.dx, y: p.cy + fit.dy, w, h });
  }
  return out;
}

export function QuadrantScatter({ points, split, quadrants, danger, x, y, groups, locale, height = 320, tableLabels }: Props) {
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  // Plot width in px, for placing labels clear of each other; a typical half-page width until measured.
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const loc = locale === "vi" ? "vi-VN" : "en-US";
  const num = (v: number, a: Props["x"]) =>
    `${a.signed && v > 0 ? "+" : v < 0 ? "−" : ""}${new Intl.NumberFormat(loc, { minimumFractionDigits: a.digits, maximumFractionDigits: a.digits }).format(Math.abs(v))}${a.suffix}`;
  const tick = (v: number) => `${v < 0 ? "−" : ""}${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(Math.abs(v))}`;

  const all = points.flatMap((p) => [p, ...(p.trail ?? [])]);
  const ax = axis(
    all.map((p) => p.x),
    split.x,
  );
  const ay = axis(
    all.map((p) => p.y),
    split.y,
  );
  const px = (v: number) => ((v - ax.lo) / (ax.hi - ax.lo)) * 100;
  const py = (v: number) => (1 - (v - ay.lo) / (ay.hi - ay.lo)) * 100;
  const sx = px(split.x);
  const sy = py(split.y);
  const corner: Record<Corner, { left: number; top: number; width: number; height: number }> = {
    tl: { left: 0, top: 0, width: sx, height: sy },
    tr: { left: sx, top: 0, width: 100 - sx, height: sy },
    bl: { left: 0, top: sy, width: sx, height: 100 - sy },
    br: { left: sx, top: sy, width: 100 - sx, height: 100 - sy },
  };
  const on = points.find((p) => p.key === active) ?? null;
  const labels = placeLabels(
    points.map((p) => ({ key: p.key, label: p.label, cx: (px(p.x) / 100) * width, cy: (py(p.y) / 100) * height })),
    width,
    height,
  );

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {groups.map((g, i) => (
            <li key={g} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {g}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setTable((t) => !t)} className="shrink-0 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {table ? tableLabels.chart : tableLabels.table}
        </button>
      </div>

      {table ? (
        <table className="tabular w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-2 font-normal">{tableLabels.name}</th>
              <th className="py-1 pr-2 text-right font-normal">{x.label}</th>
              <th className="py-1 text-right font-normal">{y.label}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-line">
                <td className="py-1 pr-2 text-ink-2">{p.name}</td>
                <td className="py-1 pr-2 text-right text-ink">{num(p.x, x)}</td>
                <td className="py-1 text-right text-ink">{num(p.y, y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] grid-rows-[auto_1.25rem_auto] gap-x-1">
          {/* y ticks */}
          <div className="relative" style={{ height }}>
            {ay.ticks.map((t) => (
              <span key={t} className="tabular absolute right-1 -translate-y-1/2 text-[10px] text-muted" style={{ top: `${py(t)}%` }}>
                {tick(t)}
              </span>
            ))}
          </div>
          {/* plot */}
          <div ref={plotRef} className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
            {danger && <div aria-hidden className="absolute bg-critical/[0.07]" style={{ left: `${corner[danger].left}%`, top: `${corner[danger].top}%`, width: `${corner[danger].width}%`, height: `${corner[danger].height}%` }} />}
            {ax.ticks.map((t) => (
              <span key={`x${t}`} aria-hidden className="absolute inset-y-0 w-px bg-grid" style={{ left: `${px(t)}%` }} />
            ))}
            {ay.ticks.map((t) => (
              <span key={`y${t}`} aria-hidden className="absolute inset-x-0 h-px bg-grid" style={{ top: `${py(t)}%` }} />
            ))}
            <span aria-hidden className="absolute inset-y-0 w-px bg-axis" style={{ left: `${sx}%` }} />
            <span aria-hidden className="absolute inset-x-0 h-px bg-axis" style={{ top: `${sy}%` }} />
            {(Object.keys(corner) as Corner[]).map((c) => (
              <span
                key={c}
                aria-hidden
                className={clsx(
                  "pointer-events-none absolute px-1.5 py-1 text-[10px] font-semibold tracking-wide uppercase",
                  c === danger ? "text-critical/80" : "text-muted",
                  c[0] === "t" ? "top-0" : "bottom-0",
                  c[1] === "l" ? "left-0" : "right-0 text-right",
                )}
              >
                {quadrants[c]}
              </span>
            ))}
            {/* The hovered economy's tail: earlier quarters fading into its dot. Drawn for one at a time; all at once is a tangle. */}
            {on?.trail?.length ? (
              <>
                <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    points={[...on.trail, on].map((q) => `${px(q.x)},${py(q.y)}`).join(" ")}
                    fill="none"
                    stroke={COLORS[on.group]}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                {on.trail.map((q, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                    style={{ left: `${px(q.x)}%`, top: `${py(q.y)}%`, background: COLORS[on.group], opacity: 0.3 + (0.5 * (i + 1)) / on.trail!.length }}
                  />
                ))}
              </>
            ) : null}
            {points.map((p) => {
              const dim = active !== null && active !== p.key;
              const place = labels[p.key];
              return (
                <span key={p.key} className={clsx("transition-opacity", dim && "opacity-30")}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(p.key)}
                    onFocus={() => setActive(p.key)}
                    onBlur={() => setActive(null)}
                    aria-label={`${p.name}: ${x.label} ${num(p.x, x)}, ${y.label} ${num(p.y, y)}`}
                    className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-s1"
                    style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%` }}
                  >
                    <span className={clsx("block rounded-full ring-2 ring-surface", active === p.key ? "size-3" : "size-2.5")} style={{ background: COLORS[p.group] }} />
                  </button>
                  {place && (
                    <span
                      aria-hidden
                      onMouseEnter={() => setActive(p.key)}
                      className="absolute text-[10px] leading-3 font-semibold whitespace-nowrap text-ink-2"
                      style={{ left: `calc(${px(p.x)}% + ${place.dx}px)`, top: `calc(${py(p.y)}% + ${place.dy}px)` }}
                    >
                      {p.label}
                    </span>
                  )}
                </span>
              );
            })}
            {on && (
              <div
                role="tooltip"
                className={clsx(
                  "pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm",
                  px(on.x) > 55 ? "-translate-x-full -ml-3" : "ml-3",
                  py(on.y) > 60 ? "-translate-y-full" : "",
                )}
                style={{ left: `${px(on.x)}%`, top: `${py(on.y)}%` }}
              >
                <div className="mb-0.5 font-semibold text-ink">{on.name}</div>
                <div className="text-ink-2">
                  {x.label}: <span className="tabular font-semibold text-ink">{num(on.x, x)}</span>
                </div>
                <div className="text-ink-2">
                  {y.label}: <span className="tabular font-semibold text-ink">{num(on.y, y)}</span>
                </div>
                {on.notes?.map((n) => (
                  <div key={n} className="text-[11px] text-muted">
                    {n}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* x ticks */}
          <span />
          <div className="relative">
            {ax.ticks.map((t) => (
              <span key={t} className="tabular absolute top-0.5 -translate-x-1/2 text-[10px] text-muted" style={{ left: `${px(t)}%` }}>
                {tick(t)}
              </span>
            ))}
          </div>
          {/* axis titles */}
          <span />
          <div className="flex justify-between gap-2 text-[11px] text-ink-2">
            <span className="text-muted">↕ {y.label}</span>
            <span>{x.label} →</span>
          </div>
        </div>
      )}
    </figure>
  );
}
