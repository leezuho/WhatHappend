import type { DatabaseSync } from "node:sqlite";
import { COT_EXTREME, COT_MARKETS, COT_MIN_WEEKS, COT_WEEKS, cotId, type CotMarket } from "@/config/cot";
import type { Point } from "@/lib/sources/store";
import { getPoints } from "./series";

// Readings of the CFTC positioning (config/cot.ts, lib/sources/cot.ts) for the
// overview. Plain SQL, no Next imports.

export interface CotRow extends CotMarket {
  /** Report date (positions as of Tuesday) of the latest week. */
  asOf: number | null;
  /** Long − short of the market's group, contracts. */
  net: number | null;
  /** Net as % of open interest: comparable across markets and over the years as open interest grows. */
  netPct: number | null;
  /** Change in net contracts since the previous report. */
  weekChange: number | null;
  /** Where netPct sits among the last COT_WEEKS weeks: 0 = the most short, 100 = the most long. */
  rank: number | null;
  extreme: "high" | "low" | null;
  /** netPct over the ranking window, for the sparkline. */
  history: Point[];
}

/** Share of the other values below the last one, ties counting half: 0 = the lowest, 100 = the highest. */
export function percentileRank(values: number[]): number | null {
  if (values.length < 2) return null;
  const cur = values[values.length - 1];
  let below = 0;
  let ties = 0;
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] < cur) below++;
    else if (values[i] === cur) ties++;
  }
  return ((below + ties / 2) / (values.length - 1)) * 100;
}

export function cotRow(def: CotMarket, net: Point[], oi: Point[]): CotRow {
  const oiAt = new Map(oi.map((p) => [p.ts, p.value]));
  const pct: Point[] = net.flatMap((p) => {
    const o = oiAt.get(p.ts);
    return o ? [{ ts: p.ts, value: (p.value / o) * 100 }] : [];
  });
  const history = pct.slice(-COT_WEEKS);
  const rank = history.length >= COT_MIN_WEEKS ? percentileRank(history.map((p) => p.value)) : null;
  const last = net[net.length - 1];
  const prev = net[net.length - 2];
  return {
    ...def,
    asOf: last?.ts ?? null,
    net: last?.value ?? null,
    netPct: last && oiAt.get(last.ts) ? (last.value / oiAt.get(last.ts)!) * 100 : null,
    weekChange: last && prev ? last.value - prev.value : null,
    rank,
    extreme: rank === null ? null : rank >= COT_EXTREME.high ? "high" : rank <= COT_EXTREME.low ? "low" : null,
    history,
  };
}

export function cotRows(db: DatabaseSync): CotRow[] {
  return COT_MARKETS.map((m) => cotRow(m, getPoints(db, cotId(m.key, "net")), getPoints(db, cotId(m.key, "oi"))));
}
