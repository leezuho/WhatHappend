import clsx from "clsx";

// Vertical bars around a zero line, one per period, oldest on the left: daily flows
// (foreign net buying), where the sign is the story. Plain HTML laid out on the
// server; every bar carries a title, and the axis prints the top, zero and bottom.

export interface ColumnRow {
  key: string;
  value: number;
  /** Hover title: the period and the value. */
  title: string;
}

interface Props {
  rows: ColumnRow[];
  height?: number;
  /** Axis text for a value. */
  tick: (v: number) => string;
  /** Text under the first and last bar (dates). */
  first: string;
  last: string;
  label: string;
}

export function ColumnBars({ rows, height = 140, tick, first, last, label }: Props) {
  if (!rows.length) return null;
  const hi = Math.max(0, ...rows.map((r) => r.value));
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;
  const zero = (hi / span) * 100;
  const w = 100 / rows.length;
  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <span aria-hidden className="absolute right-0 left-0 h-px bg-axis" style={{ top: `${zero}%` }} />
          {rows.map((r, i) => {
            const h = (Math.abs(r.value) / span) * 100;
            return (
              <span
                key={r.key}
                title={r.title}
                className={clsx("absolute", r.value >= 0 ? "rounded-t-sm bg-up" : "rounded-b-sm bg-down")}
                style={{ left: `${i * w + w * 0.15}%`, width: `${w * 0.7}%`, top: `${r.value >= 0 ? zero - h : zero}%`, height: `${Math.max(h, 0.5)}%` }}
              />
            );
          })}
        </div>
        <div className="tabular relative w-14 shrink-0 text-[10px] text-muted" style={{ height }} aria-hidden>
          <span className="absolute top-0 right-0 -translate-y-1/2">{tick(hi)}</span>
          {hi > 0 && lo < 0 && (
            <span className="absolute right-0 -translate-y-1/2" style={{ top: `${zero}%` }}>
              0
            </span>
          )}
          <span className="absolute right-0 bottom-0 translate-y-1/2">{tick(lo)}</span>
        </div>
      </div>
      <div className="mr-16 flex justify-between text-[10px] text-muted" aria-hidden>
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </figure>
  );
}
