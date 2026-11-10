import type { DatabaseSync } from "node:sqlite";
import { ASSET_CLASSES, COMMODITIES, WORLD_INDICES, type CommodityGroup, type MarketRegion } from "@/config/markets";
import { pick, type Locale } from "@/lib/i18n";
import type { Point } from "@/lib/sources/store";
import { getPoints } from "./series";
import { changeSince, thin } from "./tech";

// The overview's world-markets and commodities tables and its asset-class chart, from
// what the yahoo and vnindex sources store: live quotes and daily closes, each in its
// own currency.

const DAY = 24 * 3600_000;

export interface MarketRow {
  id: string;
  price: number | null;
  /** % changes: the latest session (open or last closed), vs 7 and 30 days ago, year to date. */
  ch1d: number | null;
  ch1w: number | null;
  ch1m: number | null;
  chYtd: number | null;
  /** About a year of daily closes, thinned to ~60 points. */
  spark: Point[];
}

export interface WorldIndexRow extends MarketRow {
  name: string;
  country: string;
  region: MarketRegion;
}

export interface CommodityRow extends MarketRow {
  name: string;
  unit: string;
  group: CommodityGroup;
}

export interface AssetClassRow {
  id: string;
  name: string;
  /** % change since the last close of last year; null without history that far back. */
  ytd: number | null;
}

/** A reader for one instrument's row, with its statement prepared once. */
function marketReader(db: DatabaseSync, now: number) {
  const quote = db.prepare("SELECT price, change_pct FROM quotes WHERE series_id = ?");
  const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  return (id: string): MarketRow => {
    const points = getPoints(db, id, now - 400 * DAY);
    const live = quote.get(id) as { price: number; change_pct: number | null } | undefined;
    const price = live?.price ?? points.at(-1)?.value ?? null;
    const since = (ts: number) => (price === null ? null : changeSince(points, price, ts));
    return {
      id,
      price,
      ch1d: live?.change_pct ?? null,
      ch1w: since(now - 7 * DAY),
      ch1m: since(now - 30 * DAY),
      chYtd: since(yearStart - 1),
      spark: thin(points.filter((p) => p.ts >= now - 365 * DAY)),
    };
  };
}

export function worldIndexRows(db: DatabaseSync, lang: Locale, now = Date.now()): WorldIndexRow[] {
  const row = marketReader(db, now);
  return WORLD_INDICES.map((ix) => ({ ...row(ix.id), name: ix.name, country: pick(ix.country, lang), region: ix.region }));
}

export function commodityRows(db: DatabaseSync, lang: Locale, now = Date.now()): CommodityRow[] {
  const row = marketReader(db, now);
  return COMMODITIES.map((c) => ({ ...row(c.id), name: pick(c.name, lang), unit: pick(c.unit, lang), group: c.group }));
}

/** Year-to-date return of each asset class, best first; ones without a number go last. */
export function assetClassRows(db: DatabaseSync, lang: Locale, now = Date.now()): AssetClassRow[] {
  const row = marketReader(db, now);
  return ASSET_CLASSES.map((a) => ({ id: a.id, name: pick(a.name, lang), ytd: row(a.id).chYtd })).sort(
    (a, b) => (b.ytd ?? -Infinity) - (a.ytd ?? -Infinity),
  );
}

// ---------------------------------------------------------------- yield-curve spreads over time

export type SpreadKey = "s2s10" | "s3m10";
export const SPREAD_IDS: Record<SpreadKey, string> = { s2s10: "fred:T10Y2Y", s3m10: "fred:T10Y3M" };

export interface SpreadRun {
  key: SpreadKey;
  value: number;
  inverted: boolean;
  /** First day of the current run on this side of zero. */
  since: number;
  /** True when the run reaches back to the first stored point, so it started earlier still. */
  atLeast: boolean;
}

export interface SpreadHistory {
  /** Both spreads by day over the window, thinned to about every third trading day. */
  rows: { ts: number; s2s10: number | null; s3m10: number | null }[];
  runs: SpreadRun[];
}

/** Current run of a spread above or below zero, over its whole stored history (the window can be shorter). */
export function spreadRun(key: SpreadKey, points: Point[]): SpreadRun | null {
  const last = points.at(-1);
  if (!last) return null;
  const inverted = last.value < 0;
  let i = points.length - 1;
  while (i > 0 && points[i - 1].value < 0 === inverted) i--;
  return { key, value: last.value, inverted, since: points[i].ts, atLeast: i === 0 };
}

export function spreadHistory(db: DatabaseSync, days = 730, now = Date.now()): SpreadHistory {
  const all = { s2s10: getPoints(db, SPREAD_IDS.s2s10), s3m10: getPoints(db, SPREAD_IDS.s3m10) };
  const from = now - days * DAY;
  const byTs = new Map<number, { ts: number; s2s10: number | null; s3m10: number | null }>();
  for (const key of ["s2s10", "s3m10"] as const) {
    for (const p of all[key]) {
      if (p.ts < from) continue;
      const row = byTs.get(p.ts) ?? { ts: p.ts, s2s10: null, s3m10: null };
      row[key] = p.value;
      byTs.set(p.ts, row);
    }
  }
  const rows = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  return {
    rows: rows.filter((_, i) => i % 3 === 0 || i === rows.length - 1),
    runs: (["s2s10", "s3m10"] as const).flatMap((k) => spreadRun(k, all[k]) ?? []),
  };
}

// ---------------------------------------------------------------- ratio of two prices

/** `num / den` on the days both have a close, from `since` on. */
export function ratioSeries(db: DatabaseSync, numId: string, denId: string, since: number): Point[] {
  const den = new Map(getPoints(db, denId, since).map((p) => [p.ts, p.value]));
  return getPoints(db, numId, since).flatMap((p) => {
    const d = den.get(p.ts);
    return d ? [{ ts: p.ts, value: p.value / d }] : [];
  });
}
