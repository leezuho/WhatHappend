import type { DatabaseSync } from "node:sqlite";
import { SERIES, type SeriesDef, type SeriesKey } from "@/config/series";
import { getDetailPoints, tileOf, type TileData } from "@/lib/data/series";

// Which indicators stand out right now, and why. Pure rules over stored data,
// shared by the web (the "What stands out" panel) and the worker (which asks
// the AI to explain each one in plain words).

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
  /** Past the series' watch or danger threshold. */
  | { kind: "crit" | "warn" }
  /** Highest or lowest reading of the past year. */
  | { kind: "high" | "low" }
  /** Latest change is `z` times the typical (one standard deviation) change. */
  | { kind: "move"; z: number };

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

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

function score(reasons: Reason[]): number {
  return reasons.reduce((s, r) => {
    if (r.kind === "crit") return s + 3;
    if (r.kind === "warn") return s + 2;
    if (r.kind === "move") return s + Math.min(Math.abs(r.z), 5) * 0.6;
    return s + 1.5;
  }, 0);
}

/** Most notable first, at most MAX_ITEMS. */
export function findNotables(db: DatabaseSync, now = Date.now()): Notable[] {
  const out: Notable[] = [];
  for (const key of Object.keys(SERIES) as SeriesKey[]) {
    const def = SERIES[key];
    const data = tileOf(db, key, now);
    if (!data) continue;
    const reasons: Reason[] = [];

    const alert = alertOf(def, data.value);
    if (alert) reasons.push({ kind: alert });

    const hist = getDetailPoints(db, SERIES[key], 400);
    const delta = def.delta === "abs" ? data.change : data.changePct;
    if (delta !== null && hist.length > MIN_CHANGES) {
      const changes = hist.slice(1).map((p, i) => (def.delta === "abs" ? p.value - hist[i].value : hist[i].value ? (p.value / hist[i].value - 1) * 100 : 0));
      const sd = stdev(changes);
      if (sd > 0 && Math.abs(delta / sd) >= MOVE_Z) reasons.push({ kind: "move", z: delta / sd });
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

    if (reasons.length) out.push({ key, def, data, reasons, range, score: score(reasons) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS);
}
