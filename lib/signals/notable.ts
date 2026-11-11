import type { DatabaseSync } from "node:sqlite";
import { SERIES, type SeriesDef, type SeriesKey } from "@/config/series";
import { getDetailPoints, tileOf, type TileData } from "@/lib/data/series";
import type { Point } from "@/lib/sources/store";

// Which indicators stand out right now, and why. Pure rules over stored data,
// shared by the web (the "What stands out" panel) and the worker (which asks
// the AI to explain each one in plain words). What is new ranks first: a
// threshold just crossed, a large move in the session or over the week, a
// 1-year extreme; a threshold crossed long ago fades out.

export type Alert = "warn" | "crit" | null;

export function alertOf(def: SeriesDef, value: number): Alert {
  const t = def.threshold;
  if (!t) return null;
  const beyond = (lvl: number) => (t.dir === "above" ? value > lvl : value < lvl);
  if (t.crit !== undefined && beyond(t.crit)) return "crit";
  if (beyond(t.warn)) return "warn";
  return null;
}

export type Reason =
  /**
   * Past the series' watch or danger threshold since `since` (the first observation of the current run
   * beyond that level). `fresh` when the run is new: at most 5 sessions for a daily series, the latest
   * release for a weekly or monthly one.
   */
  | { kind: "crit" | "warn"; since: number; fresh: boolean }
  /** Highest or lowest reading of the past year. */
  | { kind: "high" | "low" }
  /** Latest change is `z` times the typical (one standard deviation) change. */
  | { kind: "move"; z: number }
  /** Change over the past 7 days (in the tile's units: % or absolute) is `z` times the typical 7-day change. Daily series only. */
  | { kind: "week"; z: number; change: number };

export interface Notable {
  key: SeriesKey;
  def: SeriesDef;
  data: TileData;
  reasons: Reason[];
  /** Past-year range including the latest reading. */
  range: { low: number; high: number } | null;
  score: number;
}

const DAY = 24 * 3600_000;
const MOVE_Z = 2;
const MIN_CHANGES = 30;
/** Enough points for a 1-year high/low to mean something (daily series only). */
const MIN_RANGE_POINTS = 120;
const MAX_ITEMS = 8;
/** A daily series' threshold crossing counts as new for this many sessions. */
const FRESH_SESSIONS = 5;
/** An old threshold crossing loses half its weight every this many days, so a watch level breached months ago drops out. */
const STALE_HALF_LIFE_DAYS = 30;
/** An old danger-level crossing never falls below this: still listed, after anything new. */
const STALE_CRIT_FLOOR = 0.75;
/** Below this an indicator is not listed at all. */
const MIN_SCORE = 0.5;

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/**
 * A new crossing outranks almost anything; an old one starts below a 1-year high and fades by half every
 * 30 days (US CPI above its watch level since April sat on the panel every day of 2026-11), an old danger
 * level down to a floor that keeps it listed. Of a session move and a 7-day move only the larger counts,
 * since the second usually contains the first.
 */
export function scoreOf(reasons: Reason[], now: number): number {
  let s = 0;
  let move = 0;
  for (const r of reasons) {
    if (r.kind === "crit" || r.kind === "warn") {
      const base = r.kind === "crit" ? (r.fresh ? 4 : 2) : r.fresh ? 3 : 1.5;
      const faded = base * 0.5 ** (Math.max(0, now - r.since) / DAY / STALE_HALF_LIFE_DAYS);
      s += r.fresh ? base : r.kind === "crit" ? Math.max(STALE_CRIT_FLOOR, faded) : faded;
    } else if (r.kind === "move" || r.kind === "week") move = Math.max(move, Math.min(Math.abs(r.z), 5) * 0.6);
    else s += 1.5;
  }
  return s + move;
}

/** First observation of the run that ends at the last point and stays at or beyond `level`, and the run's length. */
function runBeyond(def: SeriesDef, points: Point[], level: "warn" | "crit"): { since: number; length: number; open: boolean } {
  const at = (v: number) => {
    const a = alertOf(def, v);
    return level === "warn" ? a !== null : a === "crit";
  };
  let i = points.length - 1;
  while (i > 0 && at(points[i - 1].value)) i--;
  // open: the run reaches back to the first stored point, so it began earlier still.
  return { since: points[i].ts, length: points.length - i, open: i === 0 && at(points[0].value) };
}

/**
 * Each point's change from the last point at least 7 days earlier (calendar days, like the "1 week" columns:
 * futures and crypto also print on weekends), oldest first; the last entry belongs to the last point.
 */
function weekChanges(points: Point[], diff: (a: number, b: number) => number): number[] {
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const cutoff = points[i].ts - 7 * DAY;
    while (j + 1 < i && points[j + 1].ts <= cutoff) j++;
    if (points[j].ts <= cutoff) out.push(diff(points[j].value, points[i].value));
  }
  return out;
}

/** Most notable first, at most MAX_ITEMS. */
export function findNotables(db: DatabaseSync, now = Date.now()): Notable[] {
  const out: Notable[] = [];
  for (const key of Object.keys(SERIES) as SeriesKey[]) {
    const def = SERIES[key];
    const data = tileOf(db, key, now);
    if (!data) continue;
    const reasons: Reason[] = [];
    const hist = getDetailPoints(db, SERIES[key], 400, now);
    // The tile's value may be a live quote newer than the last stored close.
    const series = hist.length && data.ts > hist[hist.length - 1].ts ? [...hist, { ts: data.ts, value: data.value }] : hist;
    const daily = !def.freq;

    const alert = alertOf(def, data.value);
    if (alert && series.length) {
      const run = runBeyond(def, series, alert);
      const fresh = !run.open && (daily ? run.length <= FRESH_SESSIONS : run.length === 1);
      reasons.push({ kind: alert, since: run.since, fresh });
    } else if (alert) reasons.push({ kind: alert, since: data.ts, fresh: true });

    const delta = def.delta === "abs" ? data.change : data.changePct;
    const diff = (a: number, b: number) => (def.delta === "abs" ? b - a : a ? (b / a - 1) * 100 : 0);
    let move: Reason | null = null;
    if (delta !== null && hist.length > MIN_CHANGES) {
      const changes = hist.slice(1).map((p, i) => diff(hist[i].value, p.value));
      const sd = stdev(changes);
      if (sd > 0 && Math.abs(delta / sd) >= MOVE_Z) reasons.push((move = { kind: "move", z: delta / sd }));
    }
    const changes7 = daily ? weekChanges(series, diff) : [];
    if (changes7.length > MIN_CHANGES) {
      const changes = changes7;
      const sd = stdev(changes);
      const change = changes[changes.length - 1];
      const z = sd > 0 ? change / sd : 0;
      // Skip it when today's flagged move makes up most of the week's.
      const sameAsMove = move !== null && delta !== null && Math.sign(delta) === Math.sign(change) && Math.abs(delta) >= 0.5 * Math.abs(change);
      if (Math.abs(z) >= MOVE_Z && !sameAsMove) reasons.push({ kind: "week", z, change });
    }

    let range: Notable["range"] = null;
    const year = hist.filter((p) => p.ts >= now - 365 * DAY);
    if (year.length >= MIN_RANGE_POINTS) {
      // Compare against earlier points only, so today's own close does not count.
      const before = year.filter((p) => p.ts < data.ts - DAY / 2).map((p) => p.value);
      const hi = Math.max(...before);
      const lo = Math.min(...before);
      if (data.value > hi) reasons.push({ kind: "high" });
      else if (data.value < lo) reasons.push({ kind: "low" });
      range = { low: Math.min(lo, data.value), high: Math.max(hi, data.value) };
    }

    const score = scoreOf(reasons, now);
    if (reasons.length && score >= MIN_SCORE) out.push({ key, def, data, reasons, range, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS);
}
