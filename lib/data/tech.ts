import type { DatabaseSync } from "node:sqlite";
import { PACKAGES, pkgId, TECH_FX, TECH_STOCKS, type PackageDef, type TechGroup } from "@/config/tech";
import type { Point } from "@/lib/sources/store";
import type { TechCap } from "@/lib/sources/yahoo";
import type { Impact, ServiceStatus, StatusIncident } from "@/lib/sources/cloudstatus";
import { getPoints } from "./series";

// The tech page's stock table, computed from what the yahoo source stores:
// live quotes, daily closes (observations) and market caps (items 'tech_caps').

const DAY = 24 * 3600_000;
const SPARK_POINTS = 60;

export interface TechStockRow {
  symbol: string;
  name: string;
  group: TechGroup;
  /** Latest price in the listing's currency. */
  price: number | null;
  currency: string | null;
  /** % changes: today (vs previous close), vs the close 30 days ago, year to date. */
  ch1d: number | null;
  ch1m: number | null;
  chYtd: number | null;
  /** Market cap converted to US dollars; null when the cap or the exchange rate is missing. */
  capUsd: number | null;
  /** About a year of daily closes, thinned to ~60 points. */
  spark: Point[];
  ts: number | null;
}

/** % change of `price` from the last close at or before `ts`; null when history does not reach back that far. */
export function changeSince(points: Point[], price: number, ts: number): number | null {
  let ref: Point | undefined;
  for (const p of points) {
    if (p.ts > ts) break;
    ref = p;
  }
  return ref && ref.value ? (price / ref.value - 1) * 100 : null;
}

/** Every n-th point, always keeping the last one. */
export function thin(points: Point[], max = SPARK_POINTS): Point[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export function techStockRows(db: DatabaseSync, now = Date.now()): TechStockRow[] {
  const quote = db.prepare("SELECT price, change_pct, ts FROM quotes WHERE series_id = ?");
  const q = (symbol: string) => quote.get(`yahoo:${symbol}`) as { price: number; change_pct: number | null; ts: number } | undefined;
  const caps = new Map(
    (db.prepare("SELECT id, data FROM items WHERE kind = 'tech_caps'").all() as { id: string; data: string | null }[]).flatMap((r) =>
      r.data ? [[r.id, JSON.parse(r.data) as TechCap] as const] : [],
    ),
  );
  /** Units of `currency` per US dollar. */
  const perUsd = (currency: string): number | null => (currency === "USD" ? 1 : TECH_FX[currency] ? (q(TECH_FX[currency])?.price ?? null) : null);
  const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);

  return TECH_STOCKS.map((s) => {
    const points = getPoints(db, `yahoo:${s.symbol}`, now - 400 * DAY);
    const live = q(s.symbol);
    const price = live?.price ?? points.at(-1)?.value ?? null;
    const cap = caps.get(s.symbol);
    const rate = cap?.currency ? perUsd(cap.currency) : null;
    return {
      symbol: s.symbol,
      name: s.name,
      group: s.group,
      price,
      currency: cap?.currency ?? null,
      ch1d: live?.change_pct ?? null,
      ch1m: price === null ? null : changeSince(points, price, now - 30 * DAY),
      chYtd: price === null ? null : changeSince(points, price, yearStart - 1),
      capUsd: cap && rate ? cap.cap / rate : null,
      spark: thin(points.filter((p) => p.ts >= now - 365 * DAY)),
      ts: live?.ts ?? points.at(-1)?.ts ?? null,
    };
  });
}

// ---------------------------------------------------------------- status board

/** An incident open longer than this is a long-running outage: listed, but not "what broke today". */
export const LONG_INCIDENT_DAYS = 14;

/** Severity order of status levels (the web may not import the fetcher's own copy). */
export const IMPACT_RANK: Record<Impact, number> = { none: 0, maintenance: 1, unknown: 2, minor: 3, major: 4, critical: 5 };

const worst = (impacts: Impact[]): Impact => impacts.reduce<Impact>((a, b) => (IMPACT_RANK[b] > IMPACT_RANK[a] ? b : a), "none");

export interface SplitStatus {
  /** The service's level with long-running incidents set aside; null when the provider could not be read. */
  level: Impact | null;
  current: StatusIncident[];
  long: StatusIncident[];
}

/**
 * Sets aside incidents open more than LONG_INCIDENT_DAYS (AWS kept two Middle East region outages open for
 * months, which pinned it at "major disruption"). The level drops only when long incidents alone explain it:
 * a provider-wide indicator worse than every incident still counts.
 */
export function splitStatus(s: ServiceStatus, now = Date.now()): SplitStatus {
  const cut = now - LONG_INCIDENT_DAYS * DAY;
  const long = s.incidents.filter((i) => i.since !== null && i.since < cut);
  const current = s.incidents.filter((i) => !long.includes(i));
  if (s.level === null || !long.length) return { level: s.level, current, long };
  const explainedByLong = long.some((i) => i.impact === s.level) && !current.some((i) => i.impact === s.level);
  return { level: explainedByLong ? worst(current.map((i) => i.impact)) : s.level, current, long };
}

// ---------------------------------------------------------------- package downloads

export interface PackageRow {
  registry: "npm" | "pypi";
  name: string;
  group: PackageDef["group"];
  /** Downloads in the last complete week. */
  week: number | null;
  /** % change of the last week against 4 and 12 weeks earlier. */
  ch4: number | null;
  ch12: number | null;
  /** Weekly totals, oldest first, for the sparkline. */
  spark: Point[];
}

/** One row per tracked package, in config order, from the weekly series pkgtrends stores. */
export function packageRows(db: DatabaseSync): PackageRow[] {
  return PACKAGES.map((p) => {
    const pts = getPoints(db, pkgId(p));
    const last = pts[pts.length - 1];
    const back = (n: number) => {
      const then = pts[pts.length - 1 - n];
      return last && then && then.value > 0 ? (last.value / then.value - 1) * 100 : null;
    };
    return { registry: p.registry, name: p.name, group: p.group, week: last?.value ?? null, ch4: back(4), ch12: back(12), spark: pts.slice(-26) };
  });
}
