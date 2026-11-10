import clsx from "clsx";
import { squarify } from "@/lib/treemap";

// Market map: one cell per entity, area by size (market cap), fill by the day's move on
// a diverging scale (green up, red down, neutral grey near zero, deeper with the size of
// the move). Plain HTML laid out on the server; every cell carries a title, and the
// legend below spells out the steps so color is never the only reading.

export interface TreemapItem {
  key: string;
  label: string;
  /** Area: market cap or similar; items without one get no cell. */
  size: number | null;
  /** Fill: % change; null draws neutral. */
  change: number | null;
  /** The change as printed in the cell and its title. */
  changeText: string;
  /** Hover title (name, size, change). */
  hint: string;
  href?: string;
}

interface Props {
  items: TreemapItem[];
  /** Width / height of the map; the layout is computed for this shape. */
  aspect: number;
  /** |change| thresholds of the three shade steps, ascending. */
  steps: readonly [number, number, number];
  /** Legend tick text for a step value. */
  tick: (v: number) => string;
  label: string;
}

const UP = ["bg-up/20", "bg-up/40", "bg-up/65"];
const DOWN = ["bg-down/20", "bg-down/40", "bg-down/65"];

function fill(change: number | null, steps: Props["steps"]): string {
  if (change === null) return "bg-surface-2";
  const step = steps.filter((s) => Math.abs(change) >= s).length;
  if (!step) return "bg-surface-2";
  return change > 0 ? UP[step - 1] : DOWN[step - 1];
}

export function Treemap({ items, aspect, steps, tick, label }: Props) {
  const W = 100 * aspect;
  const H = 100;
  const rects = squarify(
    items.map((i) => i.size ?? 0),
    { x: 0, y: 0, w: W, h: H },
  );
  return (
    <figure className="flex flex-col gap-2" aria-label={label}>
      <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: aspect }}>
        {items.map((it, k) => {
          const r = rects[k];
          if (!r) return null;
          // Share of the whole map: picks how much text fits.
          const share = (r.w * r.h) / (W * H);
          const wide = r.w / W;
          const showLabel = share > 0.006 && wide > 0.045;
          const showChange = share > 0.015 && r.h > 14;
          const Tag = it.href ? "a" : "div";
          return (
            <Tag
              key={it.key}
              {...(it.href ? { href: it.href, target: "_blank", rel: "noreferrer" } : {})}
              title={it.hint}
              className={clsx(
                "absolute flex flex-col items-center justify-center overflow-hidden rounded-[3px] border border-surface text-center leading-tight text-ink transition-[filter] hover:brightness-110",
                fill(it.change, steps),
              )}
              style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` }}
            >
              {showLabel && (
                <span className={clsx("max-w-full truncate px-0.5 font-semibold", share > 0.15 ? "text-lg" : share > 0.04 ? "text-sm" : "text-[10px]")}>{it.label}</span>
              )}
              {showLabel && showChange && <span className={clsx("tabular text-ink-2", share > 0.15 ? "text-sm" : "text-[10px]")}>{it.changeText}</span>}
            </Tag>
          );
        })}
      </div>
      <div aria-hidden className="flex items-center gap-0.5 self-end text-[10px] text-muted">
        <span className="pr-1">{tick(-steps[2])}</span>
        {[...DOWN].reverse().map((c) => (
          <span key={c} className={clsx("h-2.5 w-5 rounded-sm", c)} />
        ))}
        <span className="h-2.5 w-5 rounded-sm bg-surface-2" />
        {UP.map((c) => (
          <span key={c} className={clsx("h-2.5 w-5 rounded-sm", c)} />
        ))}
        <span className="pl-1">{tick(steps[2])}</span>
      </div>
    </figure>
  );
}
