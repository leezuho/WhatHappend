import type { DatabaseSync } from "node:sqlite";
import { SERIES } from "@/config/series";
import { GSO_RELEASE_DAY, VN30F_WEEKDAY, VN_CITIES, VN_HAZARD_BOX, VN_STORM_BOX, type Box } from "@/config/vietnam";
import { pick, type Locale } from "@/lib/i18n";
import { getPoints } from "./series";

// The Vietnam page's charts and lists computed from what other sources already store:
// CPI against the refinancing rate, hazards near the country, the market calendar.

const DAY = 24 * 3600_000;

// ---------------------------------------------------------------- inflation vs the policy rate

/** A type, not an interface, so it passes as a chart row (interfaces have no index signature). */
export type VnRatesRow = {
  /** First day of the month, UTC. */
  ts: number;
  /** CPI inflation y/y for the month; null until the IMF has it. */
  cpi: number | null;
  /** Refinancing rate at the end of the month (today for the current one). */
  refi: number | null;
};

/** One row per month from the first CPI reading (at most `years` back) to this month. */
export function vnRatesHistory(db: DatabaseSync, years = 4, now = Date.now()): VnRatesRow[] {
  const cpi = new Map(getPoints(db, SERIES.vnCpi.id).map((p) => [p.ts, p.value]));
  const refi = getPoints(db, SERIES.vnRefi.id);
  if (!cpi.size) return [];
  const d = new Date(now);
  const first = Math.max(Math.min(...cpi.keys()), Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), 1));
  const rows: VnRatesRow[] = [];
  let j = 0;
  let rate: number | null = null;
  for (let m = new Date(first); m.getTime() <= now; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const end = Math.min(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1) - 1, now);
    while (j < refi.length && refi[j].ts <= end) rate = refi[j++].value;
    rows.push({ ts: m.getTime(), cpi: cpi.get(m.getTime()) ?? null, refi: rate });
  }
  return rows;
}

// ---------------------------------------------------------------- hazards near Vietnam

export interface VnHazard {
  id: string;
  type: string;
  title: string;
  /** GDACS alert level (green / orange / red) when the source gives one. */
  level: string | null;
  /** Source magnitude: Richter for quakes, wind in knots for EONET storms. */
  severity: number | null;
  url: string | null;
  ts: number;
  /** Great-circle distance to the nearest city of VN_CITIES, and which. */
  km: number;
  city: string;
}

const STORMS = new Set(["cyclone", "storm"]);

const inBox = (b: Box, lat: number, lng: number) => lat >= b.lat[0] && lat <= b.lat[1] && lng >= b.lng[0] && lng <= b.lng[1];

function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Natural hazards of the last `days` near Vietnam (news-derived GDELT events excluded), nearest first. */
export function vnHazards(db: DatabaseSync, lang: Locale, days = 14, now = Date.now()): VnHazard[] {
  const rows = db
    .prepare("SELECT id, type, title, title_vi, lat, lng, severity, level, url, ts FROM events WHERE ts >= ? AND source != 'gdelt'")
    .all(now - days * DAY) as unknown as {
    id: string;
    type: string;
    title: string;
    title_vi: string | null;
    lat: number;
    lng: number;
    severity: number | null;
    level: string | null;
    url: string | null;
    ts: number;
  }[];
  return rows
    .filter((r) => inBox(STORMS.has(r.type) ? VN_STORM_BOX : VN_HAZARD_BOX, r.lat, r.lng))
    .map((r) => {
      const near = VN_CITIES.map((c) => ({ c, km: km(r.lat, r.lng, c.lat, c.lng) })).sort((a, b) => a.km - b.km)[0];
      return {
        id: r.id,
        type: r.type,
        title: lang === "vi" && r.title_vi ? r.title_vi : r.title,
        level: r.level,
        severity: r.severity,
        url: r.url,
        ts: r.ts,
        km: near.km,
        city: pick(near.c.name, lang),
      };
    })
    .sort((a, b) => a.km - b.km);
}

// ---------------------------------------------------------------- market calendar

export interface VnDate {
  kind: "vn30f" | "gso";
  /** Midnight UTC of the day. */
  ts: number;
  /** The month the date belongs to: the expiring contract's, or the month the statistics cover. */
  month: number;
  year: number;
}

/** Third `weekday` (0 = Sunday) of a month, as midnight UTC. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

/** VN30 futures expiries and statistics releases whose day falls in [from, until]. */
export function vnMarketDates(from: number, until: number): VnDate[] {
  const out: VnDate[] = [];
  const start = new Date(from);
  for (let i = -1; ; i++) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const month = new Date(Date.UTC(y, m, 1));
    if (month.getTime() > until) break;
    const expiry = nthWeekday(month.getUTCFullYear(), month.getUTCMonth(), VN30F_WEEKDAY, 3);
    out.push({ kind: "vn30f", ts: expiry, month: month.getUTCMonth(), year: month.getUTCFullYear() });
    // Released this month: the previous month's numbers.
    const covered = new Date(Date.UTC(y, m - 1, 1));
    out.push({ kind: "gso", ts: Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), GSO_RELEASE_DAY), month: covered.getUTCMonth(), year: covered.getUTCFullYear() });
  }
  // A day counts from its start, so today's expiry still shows in the afternoon.
  return out.filter((d) => d.ts + DAY > from && d.ts <= until).sort((a, b) => a.ts - b.ts);
}
