import type { DatabaseSync } from "node:sqlite";
import { CHOKEPOINTS, chokepointId, GPR_COUNTRIES, gprCountryId, type Chokepoint } from "@/config/geopolitics";
import type { Bi } from "@/lib/i18n";
import type { Point } from "@/lib/sources/store";
import { getPoints } from "./series";

// Readings of the geopolitical layer (config/geopolitics.ts) shared by the web
// (lib/queries-geo.ts) and the worker (theme facts). Plain SQL, no Next imports.

const DAY = 86_400_000;
/** A week a year earlier, aligned on the weekday: 52 weeks back. */
const YEAR_BACK = 364 * DAY;
/** Fewer days than this in a 7-day window (PortWatch gaps) and the average is not shown. */
const MIN_DAYS = 5;

export interface ChokepointRow extends Chokepoint {
  /** Ships a day over the 7 days to `asOf`. */
  avg7: number | null;
  tankers7: number | null;
  /** The same 7 days 52 weeks earlier. */
  yearAgo7: number | null;
  /** avg7 vs yearAgo7, %. */
  vsYear: number | null;
  /** Under half of a year earlier (from a level that means something): the route is all but shut. */
  disrupted: boolean;
  /** Last day PortWatch has. */
  asOf: number | null;
  /** Weekly averages over the whole stored history (from 2023), for the sparkline. */
  weekly: Point[];
}

/** Mean of the points in (end − days, end]; null with fewer than MIN_DAYS of them. */
function windowMean(points: Point[], end: number, days = 7): number | null {
  const sel = points.filter((p) => p.ts > end - days * DAY && p.ts <= end);
  return sel.length >= MIN_DAYS ? sel.reduce((a, p) => a + p.value, 0) / sel.length : null;
}

/** Non-overlapping 7-day means ending at the last point, oldest first. */
export function weeklyMeans(points: Point[]): Point[] {
  if (!points.length) return [];
  const out: Point[] = [];
  const first = points[0].ts;
  for (let end = points[points.length - 1].ts; end - 6 * DAY >= first; end -= 7 * DAY) {
    const m = windowMean(points, end);
    if (m !== null) out.push({ ts: end, value: m });
  }
  return out.reverse();
}

export function chokepointRow(def: Chokepoint, total: Point[], tankers: Point[]): ChokepointRow {
  const asOf = total.length ? total[total.length - 1].ts : null;
  const avg7 = asOf === null ? null : windowMean(total, asOf);
  const yearAgo7 = asOf === null ? null : windowMean(total, asOf - YEAR_BACK);
  const vsYear = avg7 !== null && yearAgo7 ? (avg7 / yearAgo7 - 1) * 100 : null;
  return {
    ...def,
    avg7,
    tankers7: asOf === null ? null : windowMean(tankers, asOf),
    yearAgo7,
    vsYear,
    disrupted: avg7 !== null && yearAgo7 !== null && yearAgo7 >= 10 && avg7 < yearAgo7 / 2,
    asOf,
    weekly: weeklyMeans(total),
  };
}

export function chokepointRows(db: DatabaseSync): ChokepointRow[] {
  return CHOKEPOINTS.map((c) => chokepointRow(c, getPoints(db, chokepointId(c.id)), getPoints(db, chokepointId(c.id, "tanker"))));
}

export interface GprRow {
  iso: string;
  name: Bi;
  /** One per month of the heatmap; null where the workbook has nothing. */
  cells: (number | null)[];
  /** Mean of the last three months that have a value: the sort key, steadier than one month. */
  recent: number | null;
}

/** The last `months` months of country GPR (index, 100 = own 1985–2019 average), highest recent level first. */
export function gprHeatmap(db: DatabaseSync, months = 24): { months: number[]; rows: GprRow[] } {
  const series = GPR_COUNTRIES.map((c) => ({ ...c, points: getPoints(db, gprCountryId(c.iso)) }));
  const last = Math.max(0, ...series.map((s) => s.points[s.points.length - 1]?.ts ?? 0));
  if (!last) return { months: [], rows: [] };
  const end = new Date(last);
  const monthTs = Array.from({ length: months }, (_, i) => Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1 - i), 1));
  const rows = series.map((s) => {
    const byTs = new Map(s.points.map((p) => [p.ts, p.value]));
    const cells = monthTs.map((ts) => byTs.get(ts) ?? null);
    const tail = cells.filter((v): v is number => v !== null).slice(-3);
    return { iso: s.iso, name: s.name, cells, recent: tail.length ? tail.reduce((a, v) => a + v, 0) / tail.length : null };
  });
  rows.sort((a, b) => (b.recent ?? -1) - (a.recent ?? -1));
  return { months: monthTs, rows };
}

/** Heatmap class of a value: 0 below the first edge, edges.length at or above the last. */
export function binOf(value: number, edges: number[]): number {
  return edges.filter((e) => value >= e).length;
}
