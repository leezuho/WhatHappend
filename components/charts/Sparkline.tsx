import type { Point } from "@/lib/sources/store";

// Pure SVG so it renders on the server: a de-emphasized trend line over a soft
// wash, with the latest point marked in the accent color. Price charts (`trend`)
// draw line, wash and dot in the market colors instead: green if the window ends
// higher than it started, red if lower.

/** `--up` / `--down` by first vs last value (or by the sign of `change` when given); null when flat or unknown. */
export function trendColor(values: number[], change?: number | null): string | null {
  const diff = change ?? (values.length < 2 ? 0 : values[values.length - 1] - values[0]);
  return diff > 0 ? "var(--up)" : diff < 0 ? "var(--down)" : null;
}

/** Stable per-data id for the wash gradient; identical data → identical gradient, so duplicates are harmless. */
function gradientId(values: number[], label = "", color = ""): string {
  let h = 5381;
  for (const ch of `${label}|${color}|${values.length}|${values[0]}|${values[values.length - 1]}`) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `spark-${(h >>> 0).toString(36)}`;
}

export function Sparkline({
  points,
  width = 120,
  height = 32,
  label,
  fluid,
  trend,
}: {
  points: Point[];
  width?: number;
  height?: number;
  label?: string;
  /** Stretch to the container's width (height stays fixed); the end-dot stays round. */
  fluid?: boolean;
  /**
   * Price chart: color by direction over the window (up green, down red). A number colors by the sign of the
   * window's reported change instead, so the line agrees with a % column printed next to it (null: first vs last).
   */
  trend?: boolean | number | null;
}) {
  if (points.length < 2) return fluid ? <div style={{ height }} aria-hidden /> : <svg width={width} height={height} aria-hidden />;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const w = fluid ? 100 : width;
  const x = (i: number) => (fluid ? 0 : pad) + (i / (points.length - 1)) * (w - (fluid ? 0 : pad * 2));
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const area = `${d}L${x(values.length - 1).toFixed(2)},${height}L${x(0).toFixed(2)},${height}Z`;
  const lx = x(values.length - 1);
  const ly = y(values[values.length - 1]);
  const tone = trend === undefined || trend === false ? null : trendColor(values, trend === true ? undefined : trend);
  const line = tone ?? "var(--muted)";
  const dot = tone ?? "var(--s1)";
  const gid = gradientId(values, label, line);
  const wash = (
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={line} stopOpacity={tone ? 0.18 : 0.22} />
        <stop offset="1" stopColor={line} stopOpacity={0} />
      </linearGradient>
    </defs>
  );

  if (fluid) {
    return (
      <div className="relative w-full" style={{ height }} role="img" aria-label={label}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
          {wash}
          <path d={area} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke={line} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span
          aria-hidden
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: "100%", top: `${((ly / height) * 100).toFixed(1)}%`, background: dot }}
        />
      </div>
    );
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      {wash}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={line} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill={dot} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
