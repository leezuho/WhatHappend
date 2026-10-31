import type { DatabaseSync } from "node:sqlite";
import { SERIES, type SeriesDef, type SeriesKey } from "@/config/series";
import type { Point } from "@/lib/sources/store";

export interface TileData {
  value: number;
  /** Absolute change vs previous close/observation. */
  change: number | null;
  changePct: number | null;
  ts: number;
  spark: Point[];
}

// Plain SQL readers shared by the UI (via lib/queries.ts) and the worker (brief).

const DAY = 24 * 3600_000;

export function getPoints(db: DatabaseSync, seriesId: string, sinceTs = 0): Point[] {
  return db
    .prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts >= ? ORDER BY ts")
    .all(seriesId, sinceTs) as unknown as Point[];
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

/** Latest value + day change + 30-day sparkline. Live quote wins over the last observation. */
export function getTile(db: DatabaseSync, def: SeriesDef, now = Date.now()): TileData | null {
  const spark = getPoints(db, def.id, now - 45 * DAY).slice(-30);
  const q = db.prepare("SELECT price, change, change_pct, ts FROM quotes WHERE series_id = ?").get(def.id) as QuoteDb | undefined;
  if (q) {
    // Make the sparkline end at the live price.
    const tail = spark.length && spark[spark.length - 1].ts >= q.ts - DAY / 2 ? spark.slice(0, -1) : spark;
    return { value: q.price, change: q.change, changePct: q.change_pct, ts: q.ts, spark: [...tail, { ts: q.ts, value: q.price }] };
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
  };
}

/** CPI is stored as an index level; readers care about year-over-year inflation. */
export function getCpiYoyTile(db: DatabaseSync): TileData | null {
  const pts = getPoints(db, SERIES.cpi.id);
  const yoy = pts.flatMap((p, i) => (i >= 12 ? [{ ts: p.ts, value: (p.value / pts[i - 12].value - 1) * 100 }] : []));
  if (!yoy.length) return null;
  const cur = yoy[yoy.length - 1];
  const prev = yoy.length > 1 ? yoy[yoy.length - 2] : null;
  return { value: cur.value, change: prev ? cur.value - prev.value : null, changePct: null, ts: cur.ts, spark: yoy.slice(-24) };
}

/** The tile for a key as displayed (CPI as y/y inflation). */
export function tileOf(db: DatabaseSync, key: SeriesKey, now = Date.now()): TileData | null {
  return key === "cpi" ? getCpiYoyTile(db) : getTile(db, SERIES[key], now);
}

/** History for the detail drawer; CPI is turned into year-over-year inflation. */
export function getDetailPoints(db: DatabaseSync, def: SeriesDef, days: number): Point[] {
  const since = Date.now() - days * DAY;
  if (def.id === "fred:CPIAUCSL") {
    const pts = getPoints(db, def.id);
    return pts.flatMap((p, i) => (i >= 12 && p.ts >= since ? [{ ts: p.ts, value: (p.value / pts[i - 12].value - 1) * 100 }] : []));
  }
  return getPoints(db, def.id, since);
}

export function getWatchlistKeys(db: DatabaseSync): string[] {
  return (db.prepare("SELECT series_id FROM watchlist ORDER BY added_at").all() as { series_id: string }[]).map((r) => r.series_id);
}
