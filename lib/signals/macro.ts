import type { Point } from "@/lib/sources/store";

// Derived world-macro readings: pure functions over stored series, shared by
// the worker (which stores the derived series) and the macro page (which
// judges each scorecard cell). Points are sorted by ts, values as stored.

const DAY = 24 * 3600_000;

// ---------------------------------------------------------------- helpers

/** The value in force at `ts`: the last point at or before it, if no older than `maxAgeMs`. */
export function valueAt(points: Point[], ts: number, maxAgeMs = Infinity): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].ts <= ts) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0 || ts - points[found].ts > maxAgeMs) return null;
  return points[found].value;
}

/** Monthly averages, stamped at the first of the month (UTC). */
export function monthlyAverages(points: Point[]): Point[] {
  const byMonth = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const d = new Date(p.ts);
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const acc = byMonth.get(key) ?? { sum: 0, n: 0 };
    acc.sum += p.value;
    acc.n++;
    byMonth.set(key, acc);
  }
  return [...byMonth].sort((a, b) => a[0] - b[0]).map(([ts, { sum, n }]) => ({ ts, value: sum / n }));
}

/** The last value of each month, stamped at the first of the month (UTC): daily policy rates → one point per month. */
export function monthlyLast(points: Point[]): Point[] {
  const byMonth = new Map<number, number>();
  for (const p of points) {
    const d = new Date(p.ts);
    byMonth.set(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), p.value);
  }
  return [...byMonth].sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value }));
}

/** a − b for every timestamp both series share (monthly series stamped on the 1st). */
export function difference(a: Point[], b: Point[]): Point[] {
  const bv = new Map(b.map((p) => [p.ts, p.value]));
  return a.flatMap((p) => {
    const v = bv.get(p.ts);
    return v === undefined ? [] : [{ ts: p.ts, value: p.value - v }];
  });
}

/**
 * a − b in basis points on a's dates, b taken as the value in force (at most 5 days old): the 1-year
 * Treasury yield (business days) against the daily effective fed funds rate gives the change in the
 * policy rate the market prices over the next year.
 */
export function spreadBp(a: Point[], b: Point[]): Point[] {
  return a.flatMap((p) => {
    const v = valueAt(b, p.ts, 5 * DAY);
    return v === null ? [] : [{ ts: p.ts, value: Math.round((p.value - v) * 100) }];
  });
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error below 1.5e-7). */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// ---------------------------------------------------------------- derived series

/**
 * NY Fed yield-curve model (Estrella & Trubin): probability, in %, of a US
 * recession twelve months ahead from the monthly-average 10Y − 3M spread (pp).
 */
export function recessionProbability(spread: number): number {
  return normCdf(-0.5333 - 0.633 * spread) * 100;
}

/** Monthly recession probabilities from the daily 10Y − 3M spread (FRED T10Y3M). The current month uses its days so far. */
export function recessionSeries(spread: Point[]): Point[] {
  return monthlyAverages(spread).map((p) => ({ ts: p.ts, value: recessionProbability(p.value) }));
}

export interface LiquidityInputs {
  /** Fed total assets, $ millions, weekly (WALCL). */
  fed: Point[];
  /** ECB total assets, € millions, weekly (ECBASSETSW). */
  ecb: Point[];
  /** Bank of Japan total assets, ¥100 millions, monthly (JPNASSETS). */
  boj: Point[];
  /** Dollars per euro, daily (DEXUSEU). */
  usdPerEur: Point[];
  /** Yen per dollar, daily (DEXJPUS). */
  jpyPerUsd: Point[];
}

/** Fed + ECB + BoJ balance sheets in $ millions, on the Fed's weekly dates; weeks missing an input are skipped. */
export function globalLiquidity({ fed, ecb, boj, usdPerEur, jpyPerUsd }: LiquidityInputs): Point[] {
  return fed.flatMap((f) => {
    const e = valueAt(ecb, f.ts, 14 * DAY);
    const b = valueAt(boj, f.ts, 75 * DAY);
    const eur = valueAt(usdPerEur, f.ts, 10 * DAY);
    const jpy = valueAt(jpyPerUsd, f.ts, 10 * DAY);
    if (e === null || b === null || eur === null || !jpy) return [];
    return [{ ts: f.ts, value: f.value + e * eur + (b * 100) / jpy }];
  });
}

export interface NetLiquidityInputs {
  /** Fed total assets, $ millions, weekly (WALCL). */
  fed: Point[];
  /** Overnight reverse repo, $ billions, daily (RRPONTSYD). */
  rrp: Point[];
  /** Treasury General Account, $ millions, weekly (WTREGEN). */
  tga: Point[];
}

/** US net liquidity = Fed balance sheet − reverse repo − Treasury account, in $ billions on the Fed's weekly dates. */
export function netLiquidity({ fed, rrp, tga }: NetLiquidityInputs): Point[] {
  return fed.flatMap((f) => {
    const r = valueAt(rrp, f.ts, 7 * DAY);
    const t = valueAt(tga, f.ts, 10 * DAY);
    if (r === null || t === null) return [];
    return [{ ts: f.ts, value: f.value / 1000 - r - t / 1000 }];
  });
}

// ---------------------------------------------------------------- business cycle clock

/**
 * OECD-style phases from the composite leading indicator: above trend (CLI > 100)
 * and rising = expansion, above and falling = slowdown, below and falling =
 * downturn, below and rising = recovery.
 */
export type CyclePhase = "expansion" | "slowdown" | "downturn" | "recovery";

export function cyclePhase(gap: number, momentum: number): CyclePhase {
  if (gap >= 0) return momentum >= 0 ? "expansion" : "slowdown";
  return momentum >= 0 ? "recovery" : "downturn";
}

export interface ClockPoint {
  ts: number;
  /** CLI − 100: distance from trend growth. */
  gap: number;
  /** Change of the CLI over `lag` months. */
  momentum: number;
}

/** The last `n` monthly positions on the clock (oldest first). */
export function clockTrail(cli: Point[], n = 7, lag = 3): ClockPoint[] {
  const out: ClockPoint[] = [];
  for (let i = Math.max(lag, cli.length - n); i < cli.length; i++) {
    out.push({ ts: cli[i].ts, gap: cli[i].value - 100, momentum: cli[i].value - cli[i - lag].value });
  }
  return out;
}

// ---------------------------------------------------------------- scorecard judgement

/** "good" = healthy, "warn" = worth watching, "crit" = alarm; null = nothing to say. */
export type Status = "good" | "warn" | "crit" | null;

/** Inflation against the central bank's target: within 1 pp is on target; deflation is a warning too. */
export function cpiStatus(cpi: number, target: number): Status {
  const gap = cpi - target;
  if (gap > 3 || cpi < -1) return "crit";
  if (gap > 1 || cpi < 0) return "warn";
  return Math.abs(gap) <= 1 ? "good" : null;
}

/** Real GDP growth: contraction is an alarm, well below the country's own pre-2020 norm a warning. */
export function gdpStatus(growth: number, normal: number | null): Status {
  if (growth < 0) return "crit";
  if (normal !== null && growth < normal - 1.5) return "warn";
  return null;
}

/** Sahm-style: how far the latest unemployment rate sits above its low of the past 12 months. */
export function unemploymentRise(points: Point[]): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const year = points.filter((p) => p.ts >= last.ts - 365 * DAY);
  if (year.length < 6) return null;
  return last.value - Math.min(...year.map((p) => p.value));
}

export function unemploymentStatus(rise: number | null): Status {
  if (rise === null) return null;
  if (rise >= 1) return "crit";
  if (rise >= 0.5) return "warn";
  return null;
}

/** % change of a currency against the dollar since `sinceTs` (positive = the currency gained). */
export function currencyChange(points: Point[], perUsd: boolean, sinceTs: number, current?: number): number | null {
  const base = valueAt(points, sinceTs);
  const now = current ?? points[points.length - 1]?.value;
  if (base === null || now === undefined || !base || !now) return null;
  return perUsd ? (base / now - 1) * 100 : (now / base - 1) * 100;
}

export function currencyStatus(change: number): Status {
  if (change <= -10) return "crit";
  if (change <= -5) return "warn";
  return null;
}

/** Leading indicator below trend and still falling. */
export function cliStatus(gap: number, momentum: number): Status {
  return cyclePhase(gap, momentum) === "downturn" ? "warn" : null;
}

/** General government gross debt, % of GDP. */
export function debtStatus(debt: number): Status {
  if (debt > 120) return "crit";
  if (debt > 90) return "warn";
  return null;
}

/** Current-account balance, % of GDP: large deficits need foreign money every year. */
export function currentAccountStatus(balance: number): Status {
  if (balance < -5) return "crit";
  if (balance < -3) return "warn";
  return null;
}

/** Average of the annual values dated within [fromYear, toYear]. */
export function averageOfYears(points: Point[], fromYear: number, toYear: number): number | null {
  const xs = points.filter((p) => {
    const y = new Date(p.ts).getUTCFullYear();
    return y >= fromYear && y <= toYear;
  });
  return xs.length ? xs.reduce((s, p) => s + p.value, 0) / xs.length : null;
}

/** General government balance, % of GDP: deficits beyond 3% (the EU's line) are a warning, beyond 6% an alarm. */
export function budgetStatus(balance: number): Status {
  if (balance < -6) return "crit";
  if (balance < -3) return "warn";
  return null;
}

/**
 * BIS credit-to-GDP gap (pp above its long-run trend): Basel III starts the
 * countercyclical buffer above 2 and maxes it at 10, the zone where past
 * credit booms turned into banking crises.
 */
export function creditGapStatus(gap: number): Status {
  if (gap > 10) return "crit";
  if (gap > 2) return "warn";
  return null;
}

/** Latest level vs the average of the points given (a decade of a real exchange rate), in %; positive = dearer than usual. */
export function deviationFromAverage(points: Point[]): number | null {
  const last = points[points.length - 1];
  if (!last || points.length < 24) return null;
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;
  return avg ? (last.value / avg - 1) * 100 : null;
}

/** Class of a value on a binned map scale: 0 below thresholds[0], thresholds.length at or above the last one. */
export function mapBin(value: number, thresholds: number[]): number {
  let i = 0;
  while (i < thresholds.length && value >= thresholds[i]) i++;
  return i;
}

