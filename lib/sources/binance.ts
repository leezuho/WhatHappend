import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { BTC_HISTORY } from "@/config/series";
import { fetchJson } from "./http";
import { dayTs, replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Binance public endpoints, no key:
//  - USDⓈ-M perpetuals: funding rate and open interest for the majors;
//  - P2P: what Vietnamese users pay / receive for USDT in VND (unofficial endpoint).
// Binance blocks some countries (the US among them, HTTP 451), so each part runs
// on its own: one blocked part is logged, the source fails only if all do.

const PERPS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
/** BTC, ETH and SOL perpetuals settle funding every 8 hours. */
const FUNDING_HOURS = 8;

const Premium = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string(),
  nextFundingTime: z.number(),
});
const OiHist = z.array(z.object({ sumOpenInterestValue: z.string(), timestamp: z.number() }));
const P2p = z.object({
  data: z.array(z.object({ adv: z.object({ price: z.string() }) })).nullish(),
});

export interface PerpRow {
  symbol: string;
  markPrice: number;
  /** Rate per funding period, as a fraction (0.0001 = 0.01%). */
  funding: number;
  /** Funding as a simple annual rate, in percent. */
  fundingApr: number;
  nextFunding: number;
  oiUsd: number | null;
  oiChange24h: number | null;
}

const OiDaily = z.array(z.object({ sumOpenInterest: z.string(), timestamp: z.number() }));
const Lsr = z.array(z.object({ longShortRatio: z.string(), timestamp: z.number() }));
const FundingHist = z.array(z.object({ fundingRate: z.string(), fundingTime: z.number() }));


/** Funding events → the day's average, annualized (percent), stamped at UTC midnight. */
export function dailyFundingApr(events: { fundingRate: string; fundingTime: number }[]): { ts: number; value: number }[] {
  const byDay = new Map<number, number[]>();
  for (const e of events) {
    const day = dayTs(e.fundingTime);
    byDay.set(day, [...(byDay.get(day) ?? []), Number(e.fundingRate)]);
  }
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, rates]) => ({ ts, value: annualizeFunding(rates.reduce((a, r) => a + r, 0) / rates.length) }));
}

async function btcHistory() {
  const [oi, lsr, funding] = await Promise.all([
    fetchJson("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=30", OiDaily),
    fetchJson("https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=30", Lsr),
    fetchJson("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=93", FundingHist),
  ]);
  return {
    // Open interest in coins, so a price move alone does not change it.
    oi: oi.map((r) => ({ ts: dayTs(r.timestamp), value: Number(r.sumOpenInterest) })),
    lsr: lsr.map((r) => ({ ts: dayTs(r.timestamp), value: Number(r.longShortRatio) })),
    funding: dailyFundingApr(funding),
  };
}

export interface P2pQuote {
  /** Median of the best ads: what a user pays to buy one USDT, and gets for selling one. */
  buy: number;
  sell: number;
  ads: number;
}

export function median(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function annualizeFunding(rate: number, hours = FUNDING_HOURS): number {
  return rate * (24 / hours) * 365 * 100;
}

async function perps(): Promise<PerpRow[]> {
  return Promise.all(
    PERPS.map(async (symbol) => {
      const [p, oi] = await Promise.all([
        fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, Premium),
        fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`, OiHist),
      ]);
      const funding = Number(p.lastFundingRate);
      const last = oi.length ? Number(oi[oi.length - 1].sumOpenInterestValue) : null;
      const first = oi.length > 1 ? Number(oi[0].sumOpenInterestValue) : null;
      return {
        symbol: symbol.replace(/USDT$/, ""),
        markPrice: Number(p.markPrice),
        funding,
        fundingApr: annualizeFunding(funding),
        nextFunding: p.nextFundingTime,
        oiUsd: last,
        oiChange24h: last !== null && first ? (last / first - 1) * 100 : null,
      };
    }),
  );
}

async function p2pSide(tradeType: "BUY" | "SELL"): Promise<number[]> {
  const r = await fetchJson("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", P2p, {
    method: "POST",
    browserUA: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fiat: "VND", asset: "USDT", tradeType, page: 1, rows: 10, payTypes: [], countries: [], publisherType: null, proMerchantAds: false }),
  });
  return (r.data ?? []).map((d) => Number(d.adv.price));
}

async function p2p(): Promise<P2pQuote> {
  const [buyAds, sellAds] = await Promise.all([p2pSide("BUY"), p2pSide("SELL")]);
  const buy = median(buyAds);
  const sell = median(sellAds);
  if (buy === null || sell === null) throw new Error("no USDT/VND P2P ads");
  return { buy, sell, ads: buyAds.length + sellAds.length };
}

export const binance: Source = {
  id: "binance",
  ...SOURCE_META.binance,
  async run({ db, log }) {
    const now = Date.now();
    const [perpRes, p2pRes, histRes] = await Promise.allSettled([perps(), p2p(), btcHistory()]);
    const failed: string[] = [];
    let written = 0;

    if (perpRes.status === "fulfilled") {
      written += replaceItems(db, "crypto_perps", perpRes.value.map((r) => ({ id: r.symbol, title: r.symbol, ts: now, data: r })));
    } else failed.push(`futures: ${perpRes.reason instanceof Error ? perpRes.reason.message : perpRes.reason}`);

    if (p2pRes.status === "fulfilled") {
      const q = p2pRes.value;
      written += replaceItems(db, "usdt_p2p", [{ id: "VND", title: "USDT/VND", ts: now, data: q }]);
      written += upsertSeries(db, "binance:USDTVND", "binance", [{ ts: dayTs(now), value: (q.buy + q.sell) / 2 }]);
    } else failed.push(`p2p: ${p2pRes.reason instanceof Error ? p2pRes.reason.message : p2pRes.reason}`);

    if (histRes.status === "fulfilled") {
      const h = histRes.value;
      written += upsertSeries(db, BTC_HISTORY.oi, "binance", h.oi);
      written += upsertSeries(db, BTC_HISTORY.lsr, "binance", h.lsr);
      written += upsertSeries(db, BTC_HISTORY.funding, "binance", h.funding);
    } else failed.push(`history: ${histRes.reason instanceof Error ? histRes.reason.message : histRes.reason}`);

    if (failed.length === 3) throw new Error(failed.join(" | "));
    if (failed.length) log(failed.join(" | "));
    return written;
  },
};
