import type { Point } from "@/lib/sources/store";

// Composite "risk regime": average of 1-year z-scores of a few stress gauges,
// each signed so that positive = more stress than usual.

export type Regime = "risk-on" | "neutral" | "risk-off" | "unknown";

export interface Component {
  key: "vix" | "hy" | "dxy" | "curve" | "fsi";
  latest: number;
  z: number;
}

export interface RegimeResult {
  regime: Regime;
  score: number | null;
  components: Component[];
  override?: string;
}

export interface RegimeInputs {
  vix?: Point[]; // CBOE VIX level
  hy?: Point[]; // ICE BofA US High Yield OAS, %
  dxy?: Point[]; // US dollar index level (we use its 21-day % change)
  curve?: Point[]; // 10Y minus 2Y, percentage points
  fsi?: Point[]; // St. Louis Fed Financial Stress Index
}

const YEAR = 365 * 24 * 3600_000;
const RISK_ON_MAX = -0.5;
const RISK_OFF_MIN = 0.75;
const VIX_PANIC = 35;

function lastYear(points: Point[]): Point[] {
  if (!points.length) return [];
  const end = points[points.length - 1].ts;
  return points.filter((p) => p.ts >= end - YEAR);
}

function zLatest(values: number[]): number | null {
  if (values.length < 30) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (!sd) return null;
  return (values[values.length - 1] - mean) / sd;
}

/** 21-observation (≈1 trading month) percent change series. */
function monthlyChange(points: Point[]): number[] {
  const out: number[] = [];
  for (let i = 21; i < points.length; i++) out.push((points[i].value / points[i - 21].value - 1) * 100);
  return out;
}

export function computeRegime(input: RegimeInputs): RegimeResult {
  const components: Component[] = [];
  const add = (key: Component["key"], series: Point[] | undefined, transform: (p: Point[]) => number[], sign: 1 | -1) => {
    if (!series?.length) return;
    const values = transform(lastYear([...series].sort((a, b) => a.ts - b.ts)));
    const z = zLatest(values);
    if (z === null) return;
    components.push({ key, latest: values[values.length - 1], z: sign * z });
  };
  const level = (p: Point[]) => p.map((x) => x.value);

  add("vix", input.vix, level, 1);
  add("hy", input.hy, level, 1);
  add("dxy", input.dxy, monthlyChange, 1); // a fast-rising dollar tightens global conditions
  add("curve", input.curve, level, -1); // flatter / more inverted = more stress
  add("fsi", input.fsi, level, 1);

  if (components.length < 2) return { regime: "unknown", score: null, components };
  const score = components.reduce((a, c) => a + c.z, 0) / components.length;

  const vixNow = input.vix?.length ? input.vix[input.vix.length - 1].value : null;
  if (vixNow !== null && vixNow > VIX_PANIC) {
    return { regime: "risk-off", score, components, override: `VIX > ${VIX_PANIC}` };
  }
  const regime: Regime = score <= RISK_ON_MAX ? "risk-on" : score >= RISK_OFF_MIN ? "risk-off" : "neutral";
  return { regime, score, components };
}
