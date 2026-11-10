import clsx from "clsx";

// Horizontal bars on one shared axis, one row per entity, value printed in a right-hand
// column: a ranked comparison (which asset won the year, which vendor has the most
// exploited flaws). Plain HTML, so it renders on the server; bars grow from zero, with
// the rounded end on the data side. Negative values grow left of the zero line.

export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  /** The value as printed in the right-hand column. */
  text: string;
  /** Longer text for the hover title (defaults to label and text). */
  hint?: string;
  /** In "highlight" mode, the rows to draw in the accent; the rest go grey. */
  highlight?: boolean;
}

interface Props {
  rows: BarRow[];
  /**
   * sign: green above zero, red below (market returns); highlight: the highlighted rows in the
   * first categorical slot, the others muted (one entity against its peers); single: all bars in
   * the first slot (counts).
   */
  color: "sign" | "highlight" | "single";
  /** Axis tick text; no ticks when omitted. */
  tick?: (v: number) => string;
  /** Accessible name of the whole chart. */
  label: string;
}

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

const GRID = "grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.5rem] items-center gap-x-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4rem] sm:gap-x-3";

export function BarList({ rows, color, tick, label }: Props) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo0 = Math.min(0, ...vals);
  const hi0 = Math.max(0, ...vals);
  const step = niceStep(hi0 - lo0 || 1);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step || step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = pos(0);

  const fill = (r: BarRow, v: number) =>
    color === "sign" ? (v >= 0 ? "bg-up" : "bg-down") : color === "single" || r.highlight ? "bg-s1" : "bg-muted/45";

  return (
    <figure className="flex flex-col" aria-label={label}>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.key} title={r.hint ?? `${r.label}: ${r.text}`} className={clsx(GRID, "h-6 rounded-md hover:bg-surface-2")}>
            <span className={clsx("truncate pl-1 text-xs", r.highlight ? "font-semibold text-ink" : "text-ink-2")}>{r.label}</span>
            <span className="relative h-full">
              {ticks.map((t) => (
                <span key={t} aria-hidden className={clsx("absolute inset-y-0 w-px", t === 0 ? "bg-axis" : "bg-grid")} style={{ left: `${pos(t)}%` }} />
              ))}
              {r.value !== null && (
                <span
                  aria-hidden
                  className={clsx("absolute top-1/2 h-3 -translate-y-1/2", r.value >= 0 ? "rounded-r" : "rounded-l", fill(r, r.value))}
                  style={{ left: `${Math.min(zero, pos(r.value))}%`, width: `${Math.max(Math.abs(pos(r.value) - zero), 0.4)}%` }}
                />
              )}
            </span>
            <span className={clsx("tabular text-right text-xs", r.value === null ? "text-muted" : r.highlight ? "font-semibold text-ink" : "text-ink")}>{r.text}</span>
          </li>
        ))}
      </ul>
      {tick && (
        <div aria-hidden className={clsx(GRID, "pt-1 text-[11px] text-muted")}>
          <span />
          <span className="relative h-3">
            {ticks.map((t) => (
              <span key={t} className="tabular absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(t)}%` }}>
                {tick(t)}
              </span>
            ))}
          </span>
          <span />
        </div>
      )}
    </figure>
  );
}
