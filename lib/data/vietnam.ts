import type { DatabaseSync } from "node:sqlite";
import { SERIES } from "@/config/series";
import { GSO_RELEASE_DAY, VN30F_WEEKDAY, VN_BAND, VN_MARKET_HOLIDAYS, VN_CENTRAL_RATE, VN_CITIES, VN_FOREIGN, VN_HAZARD_BOX, VN_STORM_BOX, type Box } from "@/config/vietnam";
import { pick, type Locale } from "@/lib/i18n";
import { getPoints } from "./series";

// The Vietnam page's charts and lists computed from what other sources already store:
// CPI against the refinancing rate, hazards near the country, the market calendar.

const DAY = 24 * 3600_000;

// ---------------------------------------------------------------- gold premium, the dollar at three prices

/** 1 lượng (tael) = 37.5 g; 1 troy ounce = 31.1034768 g. */
export const OZ_PER_LUONG = 37.5 / 31.1034768;

/** The Hanoi calendar day of `ts`, as UTC midnight of that date (the stamp daily Yahoo points use). */
export function hanoiDay(ts: number): number {
  const d = new Date(ts + 7 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The last value of each Hanoi day. */
function dailyLast(points: { ts: number; value: number }[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of points) out.set(hanoiDay(p.ts), p.value);
  return out;
}

/** The value in force at the end of `day` (a daily series stamped at UTC midnight), at most `maxDays` old. */
function onDay(points: { ts: number; value: number }[], day: number, maxDays = 5): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.ts > day) break;
    if (day - p.ts <= maxDays * DAY) v = p.value;
  }
  return v;
}

export type GoldPremiumRow = {
  ts: number;
  /** SJC bar, sell, million VND per lượng (last price of the day). */
  sjc: number;
  /** World gold (COMEX futures × USD/VND) per lượng, million VND; null when either input is missing. */
  world: number | null;
  /** sjc − world, million VND per lượng. */
  premium: number | null;
};

/** One row per Hanoi day the SJC price was stored: how far the domestic bar sits above world gold. */
export function goldPremiumHistory(db: DatabaseSync, days = 365, now = Date.now()): GoldPremiumRow[] {
  const sjc = dailyLast(getPoints(db, SERIES.sjcGold.id, now - days * DAY));
  const xau = getPoints(db, SERIES.gold.id, now - (days + 10) * DAY);
  const usd = getPoints(db, SERIES.usdvnd.id, now - (days + 10) * DAY);
  return [...sjc].map(([ts, sell]) => {
    const x = onDay(xau, ts);
    const u = onDay(usd, ts);
    const world = x !== null && u !== null ? (x * u * OZ_PER_LUONG) / 1e6 : null;
    return { ts, sjc: sell / 1e6, world, premium: world === null ? null : sell / 1e6 - world };
  });
}

export type DollarRow = {
  ts: number;
  /** Yahoo's USD/VND (interbank). */
  market: number | null;
  /** Vietcombank sell rate. */
  vcb: number | null;
  /** USDT on Binance P2P, VND. */
  p2p: number | null;
  /** Top of the State Bank's band: central rate × (1 + VN_BAND). */
  ceiling: number | null;
};

/**
 * The dollar at three prices per Hanoi day, from the first day Vietcombank or P2P has a price,
 * with the top of the State Bank's trading band: a P2P price far above the bank's is dollar
 * demand the banking system is not meeting, and a bank rate near the ceiling is the State Bank's limit.
 */
export function dollarHistory(db: DatabaseSync, days = 365, now = Date.now()): DollarRow[] {
  const since = now - days * DAY;
  const vcb = dailyLast(getPoints(db, SERIES.vcbUsd.id, since));
  const p2p = dailyLast(getPoints(db, SERIES.usdtvnd.id, since));
  const market = getPoints(db, SERIES.usdvnd.id, since - 10 * DAY);
  const central = getPoints(db, VN_CENTRAL_RATE, since - 10 * DAY);
  const stamps = [...vcb.keys(), ...p2p.keys()];
  if (!stamps.length) return [];
  const rows: DollarRow[] = [];
  for (let ts = Math.min(...stamps); ts <= hanoiDay(now); ts += DAY) {
    const c = onDay(central, ts);
    const row = { ts, market: onDay(market, ts), vcb: vcb.get(ts) ?? null, p2p: p2p.get(ts) ?? null, ceiling: c === null ? null : Math.round(c * (1 + VN_BAND)) };
    if (row.vcb !== null || row.p2p !== null) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- foreign investors on HOSE

export interface ForeignFlows {
  /** The last `sessions` trading days, oldest first: net, buy and sell value in VND. */
  rows: { ts: number; net: number; buy: number | null; sell: number | null }[];
  /** Net over the last 5 and 20 sessions and since the first session of the year, VND. */
  sum5: number;
  sum20: number;
  ytd: number;
}

export function foreignFlows(db: DatabaseSync, sessions = 40, now = Date.now()): ForeignFlows | null {
  const year = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  const net = getPoints(db, VN_FOREIGN.net, Math.min(year, now - 90 * DAY));
  if (!net.length) return null;
  const buy = new Map(getPoints(db, VN_FOREIGN.buy, net[0].ts).map((p) => [p.ts, p.value]));
  const sell = new Map(getPoints(db, VN_FOREIGN.sell, net[0].ts).map((p) => [p.ts, p.value]));
  const sum = (pts: typeof net) => pts.reduce((a, p) => a + p.value, 0);
  return {
    rows: net.slice(-sessions).map((p) => ({ ts: p.ts, net: p.value, buy: buy.get(p.ts) ?? null, sell: sell.get(p.ts) ?? null })),
    sum5: sum(net.slice(-5)),
    sum20: sum(net.slice(-20)),
    ytd: sum(net.filter((p) => p.ts >= year)),
  };
}

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

const VN_HOLIDAYS = new Set(VN_MARKET_HOLIDAYS);

/** The day itself (midnight UTC) if HOSE trades on it, otherwise the last trading day before it. */
export function vnTradingDayOnOrBefore(ts: number): number {
  for (let t = ts; ; t -= DAY) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !VN_HOLIDAYS.has(d.toISOString().slice(0, 10))) return t;
  }
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
    const expiry = vnTradingDayOnOrBefore(nthWeekday(month.getUTCFullYear(), month.getUTCMonth(), VN30F_WEEKDAY, 3));
    out.push({ kind: "vn30f", ts: expiry, month: month.getUTCMonth(), year: month.getUTCFullYear() });
    // Released this month: the previous month's numbers.
    const covered = new Date(Date.UTC(y, m - 1, 1));
    out.push({ kind: "gso", ts: Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), GSO_RELEASE_DAY), month: covered.getUTCMonth(), year: covered.getUTCFullYear() });
  }
  // A day counts from its start, so today's expiry still shows in the afternoon.
  return out.filter((d) => d.ts + DAY > from && d.ts <= until).sort((a, b) => a.ts - b.ts);
}

/** The State Bank's latest central rate, its band and how far Vietcombank's sell rate sits below the ceiling. */
export function centralBand(db: DatabaseSync): { ts: number; central: number; ceiling: number; floor: number; vcb: number | null } | null {
  const c = getPoints(db, VN_CENTRAL_RATE).at(-1);
  if (!c) return null;
  const vcb = getPoints(db, SERIES.vcbUsd.id).at(-1)?.value ?? null;
  return { ts: c.ts, central: c.value, ceiling: Math.round(c.value * (1 + VN_BAND)), floor: Math.round(c.value * (1 - VN_BAND)), vcb };
}
