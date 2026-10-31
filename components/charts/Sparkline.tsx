import type { Point } from "@/lib/sources/store";

// Pure SVG so it renders on the server: a de-emphasized trend line with the
// latest point marked in the accent color.

export function Sparkline({ points, width = 120, height = 32, label }: { points: Point[]; width?: number; height?: number; label?: string }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const lx = x(values.length - 1);
  const ly = y(values[values.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={d} fill="none" stroke="var(--axis)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
