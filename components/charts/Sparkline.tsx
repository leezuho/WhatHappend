import type { Point } from "@/lib/sources/store";

// Pure SVG so it renders on the server: a de-emphasized trend line over a soft
// wash, with the latest point marked in the accent color.

/** Stable per-data id for the wash gradient; identical data → identical gradient, so duplicates are harmless. */
function gradientId(values: number[], label = ""): string {
  let h = 5381;
  for (const ch of `${label}|${values.length}|${values[0]}|${values[values.length - 1]}`) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `spark-${(h >>> 0).toString(36)}`;
}

export function Sparkline({
  points,
  width = 120,
  height = 32,
  label,
  fluid,
}: {
  points: Point[];
  width?: number;
  height?: number;
  label?: string;
  /** Stretch to the container's width (height stays fixed); the end-dot stays round. */
  fluid?: boolean;
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
  const gid = gradientId(values, label);
  const wash = (
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--muted)" stopOpacity={0.22} />
        <stop offset="1" stopColor="var(--muted)" stopOpacity={0} />
      </linearGradient>
    </defs>
  );

  if (fluid) {
    return (
      <div className="relative w-full" style={{ height }} role="img" aria-label={label}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
          {wash}
          <path d={area} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span
          aria-hidden
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-s1 ring-2 ring-surface"
          style={{ left: "100%", top: `${((ly / height) * 100).toFixed(1)}%` }}
        />
      </div>
    );
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      {wash}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
