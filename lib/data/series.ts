import type { DatabaseSync } from "node:sqlite";
import { SERIES, type Freq, type SeriesDef, type SeriesKey } from "@/config/series";
import type { Point } from "@/lib/sources/store";

export interface TileData {
  value: number;
  /** Absolute change vs previous close/observation. */
  change: number | null;
  changePct: number | null;
  ts: number;
  spark: Point[];
  /** Low and high of the last year, current value included; absent when history is shorter than ~10 months. */
  range?: { lo: number; hi: number };
}

// Plain SQL readers shared by the UI (via lib/queries.ts) and the worker (brief).

const DAY = 24 * 3600_000;

export function getPoints(db: DatabaseSync, seriesId: string, sinceTs = 0): Point[] {
  return db
    .prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts >= ? ORDER BY ts")
    .all(seriesId, sinceTs) as unknown as Point[];
}

/**
 * Of several series measuring the same thing (OECD's and the IMF's CPI, a daily and a monthly yield), the one whose
 * latest point at or before `now` is newest, with that point; ties go to the earlier id, missing ids are skipped.
 */
export function freshest(db: DatabaseSync, ids: (string | null | undefined | false)[], now = Date.now()): { id: string; last: Point } | null {
  const stmt = db.prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1");
  let best: { id: string; last: Point } | null = null;
  for (const id of ids) {
    if (!id) continue;
    const row = stmt.get(id, now) as Point | undefined;
    if (row && (!best || row.ts > best.last.ts)) best = { id, last: { ts: row.ts, value: row.value } };
  }
  return best;
}

export function getLastPoints(db: DatabaseSync, seriesId: string, n: number): Point[] {
  const rows = db
    .prepare("SELECT ts, value FROM observations WHERE series_id = ? ORDER BY ts DESC LIMIT ?")
    .all(seriesId, n) as unknown as Point[];
  return rows.reverse();
}

interface QuoteDb {
  price: number;
  change: number | null;
  change_pct: number | null;
  ts: number;
}

/** A history that starts this long ago counts as "a year" for the range bar. */
const RANGE_MIN_SPAN = 300 * DAY;

/** One-year low/high around `current`, or undefined when the series is too young to have one. */
export function yearRange(db: DatabaseSync, seriesId: string, current: number, now = Date.now()): TileData["range"] {
  const r = db
    .prepare("SELECT MIN(value) AS lo, MAX(value) AS hi, MIN(ts) AS first FROM observations WHERE series_id = ? AND ts >= ?")
    .get(seriesId, now - 365 * DAY) as { lo: number | null; hi: number | null; first: number | null } | undefined;
  if (!r || r.lo === null || r.hi === null || r.first === null || r.first > now - RANGE_MIN_SPAN) return undefined;
  const lo = Math.min(r.lo, current);
  const hi = Math.max(r.hi, current);
  return hi > lo ? { lo, hi } : undefined;
}

/** Sparkline length of a low-frequency series, in observations: half a year of weeks, two years of months, three of quarters, ten years. */
const SPARK_OBS: Record<Freq, number> = { w: 26, m: 24, q: 12, y: 10 };

/**
 * Weekly to annual series: latest observation vs the one before, sparkline over
 * the last SPARK_OBS readings. Annual IMF series also store forecasts dated in
 * future years; only periods that have started count.
 */
function getPeriodTile(db: DatabaseSync, def: SeriesDef, freq: Freq, now: number): TileData | null {
  const spark = (
    db.prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts <= ? ORDER BY ts DESC LIMIT ?").all(def.id, now, SPARK_OBS[freq]) as unknown as Point[]
  ).reverse();
  const cur = spark[spark.length - 1];
  if (!cur) return null;
  const prev = spark.length > 1 ? spark[spark.length - 2] : null;
  return {
    value: cur.value,
    change: prev ? cur.value - prev.value : null,
    changePct: prev && prev.value ? (cur.value / prev.value - 1) * 100 : null,
    ts: cur.ts,
    spark,
    range: freq === "y" ? undefined : yearRange(db, def.id, cur.value, now),
  };
}

/** % change from the reading stamped exactly one year earlier (monthly and quarterly series); periods without one are dropped. */
export function yoyOf(points: Point[]): Point[] {
  const byTs = new Map(points.map((p) => [p.ts, p.value]));
  return points.flatMap((p) => {
    const d = new Date(p.ts);
    const prev = byTs.get(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
    return prev ? [{ ts: p.ts, value: (p.value / prev - 1) * 100 }] : [];
  });
}

/** Stored points → what readers see for a series with a `transform` (y/y change or change from the previous reading) and/or a `scale`. */
export function displayPoints(def: SeriesDef, points: Point[]): Point[] {
  const out =
    def.transform === "yoy" ? yoyOf(points) : def.transform === "diff" ? points.slice(1).map((p, i) => ({ ts: p.ts, value: p.value - points[i].value })) : points;
  const k = def.scale;
  return k ? out.map((p) => ({ ts: p.ts, value: p.value * k })) : out;
}

/** Tile of a transformed series: computed over its whole stored history, then cut like a period tile. */
function getDerivedTile(db: DatabaseSync, def: SeriesDef, now: number): TileData | null {
  const pts = displayPoints(def, getPoints(db, def.id).filter((p) => p.ts <= now));
  const cur = pts[pts.length - 1];
  if (!cur) return null;
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const year = pts.filter((p) => p.ts > now - 365 * DAY);
  const lo = Math.min(...year.map((p) => p.value), cur.value);
  const hi = Math.max(...year.map((p) => p.value), cur.value);
  const longEnough = pts.some((p) => p.ts <= now - RANGE_MIN_SPAN);
  return {
    value: cur.value,
    change: prev ? cur.value - prev.value : null,
    changePct: prev && prev.value ? (cur.value / prev.value - 1) * 100 : null,
    ts: cur.ts,
    spark: pts.slice(-SPARK_OBS[def.freq ?? "m"]),
    range: longEnough && hi > lo ? { lo, hi } : undefined,
  };
}

/** Latest value + day change + 30-day sparkline + 1-year range. Live quote wins over the last observation. */
export function getTile(db: DatabaseSync, def: SeriesDef, now = Date.now()): TileData | null {
  if (def.transform || def.scale) return getDerivedTile(db, def, now);
  if (def.freq) return getPeriodTile(db, def, def.freq, now);
  const spark = getPoints(db, def.id, now - 45 * DAY).slice(-30);
  const q = db.prepare("SELECT price, change, change_pct, ts FROM quotes WHERE series_id = ?").get(def.id) as QuoteDb | undefined;
  if (q) {
    // Make the sparkline end at the live price.
    const tail = spark.length && spark[spark.length - 1].ts >= q.ts - DAY / 2 ? spark.slice(0, -1) : spark;
    return {
      value: q.price,
      change: q.change,
      changePct: q.change_pct,
      ts: q.ts,
      spark: [...tail, { ts: q.ts, value: q.price }],
      range: yearRange(db, def.id, q.price, now),
    };
  }
  const last = getLastPoints(db, def.id, 2);
  if (!last.length) return null;
  const cur = last[last.length - 1];
  const prev = last.length > 1 ? last[0] : null;
  return {
    value: cur.value,
    change: prev ? cur.value - prev.value : null,
    changePct: prev && prev.value ? (cur.value / prev.value - 1) * 100 : null,
    ts: cur.ts,
    spark: spark.length ? spark : last,
    range: yearRange(db, def.id, cur.value, now),
  };
}

/** The tile for a key as displayed (transformed series as their change). */
export function tileOf(db: DatabaseSync, key: SeriesKey, now = Date.now()): TileData | null {
  return getTile(db, SERIES[key], now);
}

/** History for the detail drawer, up to today (no forecasts), transformed as displayed (CPI as y/y inflation). */
export function getDetailPoints(db: DatabaseSync, def: SeriesDef, days: number, now = Date.now()): Point[] {
  const since = now - days * DAY;
  if (def.transform || def.scale) return displayPoints(def, getPoints(db, def.id)).filter((p) => p.ts >= since && p.ts <= now);
  return getPoints(db, def.id, since).filter((p) => p.ts <= now);
}

export function getWatchlistKeys(db: DatabaseSync): string[] {
  return (db.prepare("SELECT series_id FROM watchlist ORDER BY added_at").all() as { series_id: string }[]).map((r) => r.series_id);
}
