import type { Point } from "@/lib/sources/store";

// Composite "risk regime" (LLDD 06, v2 from 2026-11-11). Each stress gauge is
// read against up to ten years of its own history, signed so that positive =
// more stress than usual, clamped to ±3, and averaged with a lower weight for
// readings that are late. The regime changes only after the new reading has held
// for two sessions (a VIX panic switches at once). Credit-spread *speed* is kept
// out of the score and reported as a divergence warning instead.
//
// v1 measured everything against one year. On 2026-11-10 that called a calm day
// "risk-off" (score 0.88): HY at 3.42%, low by any longer standard, was +2.5σ
// against a year of unusually tight spreads, and a 2s10s of 0.32 counted as
// stress against a year spent near 0.5.

export type Regime = "risk-on" | "neutral" | "risk-off" | "unknown";
export type ComponentKey = "vix" | "credit" | "dxy" | "curve" | "fsi" | "trend" | "breadth";

export interface Component {
  key: ComponentKey;
  /**
   * The reading behind the z: VIX level, Baa−10Y spread (%), DXY 21-session change (%), 2s10s (pp),
   * STLFSI, S&P 500 distance above its 200-session average (%), share of world markets above their 50-session average (0–1).
   */
  value: number;
  /** Date of the newest point behind `value`. */
  ts: number;
  /** Stress-signed z, clamped to ±3. */
  z: number;
  /** 1, or 0.5 when the newest point is late for its cadence. */
  weight: number;
  /** Years of history the z is measured against; absent for STLFSI (already standardised) and breadth (fixed rule). */
  years?: number;
  /** Breadth only: markets above their 50-session average, of those with recent data. */
  count?: { above: number; total: number };
}

/** High-yield spreads widening from their recent low while US stocks still trend up. */
export interface CreditDivergence {
  hy: number;
  hyTs: number;
  low: number;
  lowTs: number;
  /** S&P 500 distance above its 200-session average, %. */
  spxGap: number;
}

export interface RegimeResult {
  regime: Regime;
  /** The latest session's weighted mean z. */
  score: number | null;
  components: Component[];
  override?: string;
  /** First session of the current regime; `sinceAtLeast` when the run reaches back past the sessions examined. */
  since: number | null;
  sinceAtLeast: boolean;
  /** The latest session's own reading when it differs from the regime shown (not yet held long enough). */
  pending: Regime | null;
  divergence: CreditDivergence | null;
}

export interface RegimeInputs {
  vix?: Point[]; // CBOE VIX close (FRED VIXCLS for history, Yahoo for the latest)
  credit?: Point[]; // Moody's Baa corporate yield minus 10Y Treasury, %
  dxy?: Point[]; // US dollar index level; its 21-session % change is used
  curve?: Point[]; // 10Y minus 2Y, percentage points
  fsi?: Point[]; // St. Louis Fed Financial Stress Index (weekly, 0 = average)
  spx?: Point[]; // S&P 500 close (FRED SP500 for history, Yahoo for the latest)
  hy?: Point[]; // ICE BofA US High Yield OAS, % (FRED keeps only 3 years: used for the divergence, not the score)
  markets?: Point[][]; // daily closes of the world's main stock indices (breadth)
}

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
export const WINDOW_YEARS = 10;
/** About a year of daily values: enough for a z that means something. */
const MIN_VALUES = 250;
const MAX_Z = 3;
export const RISK_ON_MAX = -0.5;
export const RISK_OFF_MIN = 0.75;
export const VIX_PANIC = 35;
/** Sessions a new reading must hold before the regime changes. */
export const HOLD_SESSIONS = 2;
const LOOKBACK_SESSIONS = 15;
/** HY OAS rise from its low of the last ~3 months that counts as a divergence, percentage points. */
export const DIVERGENCE_PP = 0.5;
const DIVERGENCE_SESSIONS = 63;
const MA_LONG = 200;
const MA_SHORT = 50;

const clampZ = (z: number) => Math.max(-MAX_Z, Math.min(MAX_Z, z));

/** Daily points of two sources for the same thing, by day; `live` wins on days both have. */
export function mergeDaily(history: Point[], live: Point[]): Point[] {
  const byDay = new Map<number, number>();
  for (const p of history) byDay.set(Math.floor(p.ts / DAY) * DAY, p.value);
  for (const p of live) byDay.set(Math.floor(p.ts / DAY) * DAY, p.value);
  return [...byDay].sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value }));
}

/** Index of the last point at or before `t`, or -1. */
function lastAt(points: Point[], t: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].ts <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function sorted(points: Point[] | undefined): Point[] {
  return points?.length ? [...points].sort((a, b) => a.ts - b.ts) : [];
}

/** n-session percent change. */
function changeSeries(points: Point[], n: number): Point[] {
  const out: Point[] = [];
  for (let i = n; i < points.length; i++) out.push({ ts: points[i].ts, value: (points[i].value / points[i - n].value - 1) * 100 });
  return out;
}

/** Percent distance of each close above its n-session average. */
function gapSeries(points: Point[], n: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].value;
    if (i >= n) sum -= points[i - n].value;
    if (i >= n - 1) out.push({ ts: points[i].ts, value: (points[i].value / (sum / n) - 1) * 100 });
  }
  return out;
}

interface Gauge {
  key: Exclude<ComponentKey, "breadth">;
  points: Point[];
  sign: 1 | -1;
  /** Age of the newest point still read at full weight; up to three times that at half weight, then dropped. */
  maxAgeDays: number;
  /** "z": against its own history; "raw": the value already is a z (STLFSI). */
  mode: "z" | "raw";
}

function readGauge(g: Gauge, t: number): Component | null {
  const i = lastAt(g.points, t);
  if (i < 0) return null;
  const last = g.points[i];
  const age = (t - last.ts) / DAY;
  const weight = age <= g.maxAgeDays ? 1 : age <= 3 * g.maxAgeDays ? 0.5 : 0;
  if (!weight) return null;
  if (g.mode === "raw") return { key: g.key, value: last.value, ts: last.ts, z: clampZ(g.sign * last.value), weight };
  const from = last.ts - WINDOW_YEARS * YEAR;
  let start = i;
  while (start > 0 && g.points[start - 1].ts > from) start--;
  const n = i - start + 1;
  if (n < MIN_VALUES) return null;
  let mean = 0;
  for (let k = start; k <= i; k++) mean += g.points[k].value;
  mean /= n;
  let sq = 0;
  for (let k = start; k <= i; k++) sq += (g.points[k].value - mean) ** 2;
  const sd = Math.sqrt(sq / n);
  if (!sd) return null;
  const years = Math.max(1, Math.round((last.ts - g.points[start].ts) / YEAR));
  return { key: g.key, value: last.value, ts: last.ts, z: clampZ((g.sign * (last.value - mean)) / sd), weight, years };
}

/**
 * Share of markets closing above their 50-session average, as a stress reading on a fixed scale:
 * all above → −1, half → 0, none → +1. Markets without a close in the last week are left out.
 */
function readBreadth(markets: Point[][], t: number): Component | null {
  let above = 0;
  let total = 0;
  let ts = 0;
  for (const m of markets) {
    const i = lastAt(m, t);
    if (i < MA_SHORT - 1 || t - m[i].ts > 7 * DAY) continue;
    let sum = 0;
    for (let k = i - MA_SHORT + 1; k <= i; k++) sum += m[k].value;
    total++;
    if (m[i].value > sum / MA_SHORT) above++;
    ts = Math.max(ts, m[i].ts);
  }
  if (total < 5) return null;
  const share = above / total;
  return { key: "breadth", value: share, ts, z: 2 * (0.5 - share), weight: 1, count: { above, total } };
}

interface Reading {
  regime: Regime;
  score: number | null;
  components: Component[];
  override?: string;
}

function classify(components: Component[]): Reading {
  if (components.length < 2) return { regime: "unknown", score: null, components };
  const w = components.reduce((a, c) => a + c.weight, 0);
  const score = components.reduce((a, c) => a + c.weight * c.z, 0) / w;
  const vix = components.find((c) => c.key === "vix");
  if (vix && vix.value > VIX_PANIC) return { regime: "risk-off", score, components, override: `VIX > ${VIX_PANIC}` };
  return { regime: score <= RISK_ON_MAX ? "risk-on" : score >= RISK_OFF_MIN ? "risk-off" : "neutral", score, components };
}

function divergenceAt(hy: Point[], spxGap: Point[], t: number): CreditDivergence | null {
  const i = lastAt(hy, t);
  const j = lastAt(spxGap, t);
  if (i < 0 || j < 0 || t - hy[i].ts > 10 * DAY) return null;
  let low = hy[i];
  for (let k = Math.max(0, i - DIVERGENCE_SESSIONS); k < i; k++) if (hy[k].value < low.value) low = hy[k];
  const gap = spxGap[j].value;
  // Rounded to the basis point so float noise (3.1 − 2.6 = 0.4999…) does not decide.
  if (Math.round((hy[i].value - low.value) * 100) < DIVERGENCE_PP * 100 || gap <= 0) return null;
  return { hy: hy[i].value, hyTs: hy[i].ts, low: low.value, lowTs: low.ts, spxGap: gap };
}

export function computeRegime(input: RegimeInputs, now = Date.now()): RegimeResult {
  const vix = sorted(input.vix);
  const spx = sorted(input.spx);
  const spxGap = gapSeries(spx, MA_LONG);
  const markets = (input.markets ?? []).map(sorted);
  const gauges: Gauge[] = [
    { key: "vix", points: vix, sign: 1, maxAgeDays: 4, mode: "z" },
    { key: "credit", points: sorted(input.credit), sign: 1, maxAgeDays: 5, mode: "z" },
    // A fast-rising dollar tightens global conditions.
    { key: "dxy", points: changeSeries(sorted(input.dxy), 21), sign: 1, maxAgeDays: 4, mode: "z" },
    // Flatter or more inverted than usual = more stress.
    { key: "curve", points: sorted(input.curve), sign: -1, maxAgeDays: 5, mode: "z" },
    { key: "fsi", points: sorted(input.fsi), sign: 1, maxAgeDays: 14, mode: "raw" },
    // Stocks far above their long average = less stress.
    { key: "trend", points: spxGap, sign: -1, maxAgeDays: 4, mode: "z" },
  ];
  const readAt = (t: number) =>
    classify([...gauges.flatMap((g) => readGauge(g, t) ?? []), ...(markets.length ? [readBreadth(markets, t)].flatMap((c) => c ?? []) : [])]);

  // US sessions, from the VIX (or the S&P when VIX is missing). Earlier sessions are read as of their
  // own close; the latest as of now, so a gauge that stopped updating loses weight.
  const days = (vix.length ? vix : spx).filter((p) => p.ts <= now).map((p) => p.ts);
  const sessions = days.slice(-LOOKBACK_SESSIONS);
  const readings = sessions.map((d, k) => readAt(k === sessions.length - 1 ? now : Math.min(d + DAY - 1, now)));
  const today = readings.length ? readings[readings.length - 1] : readAt(now);
  const divergence = divergenceAt(sorted(input.hy), spxGap, now);
  if (today.regime === "unknown" || !readings.length) {
    return { ...today, since: null, sinceAtLeast: false, pending: null, divergence };
  }

  // Hysteresis: a new reading becomes the regime once it has held for HOLD_SESSIONS in a row.
  let state: Regime = "unknown";
  let since = sessions[0];
  let run = 0;
  for (let k = 0; k < readings.length; k++) {
    const r = readings[k];
    if (r.regime === "unknown") continue;
    if (state === "unknown") {
      state = r.regime;
      since = sessions[k];
      continue;
    }
    run = k > 0 && readings[k - 1].regime === r.regime ? run + 1 : 1;
    if (r.regime === state) continue;
    if (r.override || run >= HOLD_SESSIONS) {
      state = r.regime;
      since = sessions[r.override ? k : k - run + 1];
    }
  }
  const firstKnown = readings.findIndex((r) => r.regime !== "unknown");
  return {
    regime: state,
    score: today.score,
    components: today.components,
    override: today.override,
    since,
    sinceAtLeast: since === sessions[firstKnown],
    pending: today.regime !== state ? today.regime : null,
    divergence,
  };
}
