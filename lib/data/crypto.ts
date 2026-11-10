import type { DatabaseSync } from "node:sqlite";
import { BTC_ETF, BTC_HISTORY, SERIES } from "@/config/series";
import { getPoints } from "./series";

// The crypto page's leverage chart from series the binance and yahoo sources store.

const DAY = 24 * 3600_000;

/** A type, not an interface, so it passes as a chart row. */
export type LeverageRow = {
  ts: number;
  /** BTC price and perpetual open interest (in coins), both rebased to 100 on the first day. */
  price: number | null;
  oi: number | null;
};

export interface BtcLeverage {
  rows: LeverageRow[];
  /** Accounts long per account short on Binance BTC perpetuals: latest and its average over the window. */
  lsr: { last: number; avg: number } | null;
  /** Funding as an annual rate, %: latest day and the window's average. */
  funding: { last: number; avg: number } | null;
  /** Change over the window, %. */
  oiChange: number | null;
  priceChange: number | null;
}

const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

export function btcLeverage(db: DatabaseSync, days = 90, now = Date.now()): BtcLeverage | null {
  const since = now - days * DAY;
  const oi = getPoints(db, BTC_HISTORY.oi, since);
  if (oi.length < 2) return null;
  const price = new Map(getPoints(db, SERIES.btc.id, since - 3 * DAY).map((p) => [p.ts, p.value]));
  const p0 = price.get(oi[0].ts) ?? null;
  const rows = oi.map((p) => {
    const px = price.get(p.ts);
    return { ts: p.ts, oi: (p.value / oi[0].value) * 100, price: px !== undefined && p0 ? (px / p0) * 100 : null };
  });
  const lsr = getPoints(db, BTC_HISTORY.lsr, since);
  const funding = getPoints(db, BTC_HISTORY.funding, oi[0].ts);
  const lastPrice = rows.findLast((r) => r.price !== null)?.price ?? null;
  return {
    rows,
    lsr: lsr.length ? { last: lsr[lsr.length - 1].value, avg: avg(lsr.map((p) => p.value)) } : null,
    funding: funding.length ? { last: funding[funding.length - 1].value, avg: avg(funding.map((p) => p.value)) } : null,
    oiChange: rows[rows.length - 1].oi! - 100,
    priceChange: lastPrice === null ? null : lastPrice - 100,
  };
}

export interface EtfFlows {
  /** Daily total net flow, $M, oldest first (the last `days` stored). */
  rows: { ts: number; total: number }[];
  /** The latest day's flow per fund (largest funds by name), $M. */
  latest: { ts: number; total: number; funds: { fund: string; value: number }[] };
  /** Sum over the last 5 rows and over every row shown. */
  sum5: number;
  sumAll: number;
}

export function etfFlows(db: DatabaseSync, days = 40, now = Date.now()): EtfFlows | null {
  const total = getPoints(db, BTC_ETF.total, now - 120 * DAY).slice(-days);
  const last = total[total.length - 1];
  if (!last) return null;
  const funds = BTC_ETF.funds.flatMap((fund) => {
    const p = getPoints(db, `${BTC_ETF.prefix}${fund}`, last.ts).find((x) => x.ts === last.ts);
    return p ? [{ fund, value: p.value }] : [];
  });
  const sum = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
  return {
    rows: total.map((p) => ({ ts: p.ts, total: p.value })),
    latest: { ts: last.ts, total: last.value, funds },
    sum5: sum(total.slice(-5)),
    sumAll: sum(total),
  };
}
