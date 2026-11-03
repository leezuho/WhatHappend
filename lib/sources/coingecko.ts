import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson, type FetchOpts } from "./http";
import { dayTs, replaceItems, upsertQuotes, upsertSeries } from "./store";
import type { Source } from "./types";

// CoinGecko public API: market-wide totals, the top coins by market cap and
// what is trending. No key needed. COINGECKO_API_KEY (a free "Demo" key) is
// sent when set: cloud hosts share IPs and hit the keyless rate limit sooner.

const BASE = "https://api.coingecko.com/api/v3";
const TOP_N = 20;
const SPARK_POINTS = 42;

const Global = z.object({
  data: z.object({
    total_market_cap: z.record(z.string(), z.number()),
    total_volume: z.record(z.string(), z.number()),
    market_cap_percentage: z.record(z.string(), z.number()),
    market_cap_change_percentage_24h_usd: z.number().nullish(),
  }),
});

const Coin = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: z.number().nullish(),
  market_cap: z.number().nullish(),
  market_cap_rank: z.number().nullish(),
  total_volume: z.number().nullish(),
  price_change_percentage_1h_in_currency: z.number().nullish(),
  price_change_percentage_24h_in_currency: z.number().nullish(),
  price_change_percentage_7d_in_currency: z.number().nullish(),
  ath_change_percentage: z.number().nullish(),
  sparkline_in_7d: z.object({ price: z.array(z.number().nullable()) }).nullish(),
});
type CoinIn = z.infer<typeof Coin>;

const Trending = z.object({
  coins: z.array(
    z.object({
      item: z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        market_cap_rank: z.number().nullish(),
        data: z
          .object({
            price: z.number().nullish(),
            price_change_percentage_24h: z.record(z.string(), z.number().nullish()).nullish(),
          })
          .nullish(),
      }),
    }),
  ),
});

export interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  rank: number | null;
  price: number;
  marketCap: number | null;
  volume: number | null;
  ch1h: number | null;
  ch24h: number | null;
  ch7d: number | null;
  fromAth: number | null;
  spark: number[];
}

export interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  rank: number | null;
  price: number | null;
  ch24h: number | null;
}

export interface CryptoGlobal {
  mcapUsd: number;
  volumeUsd: number | null;
  mcapChange24h: number | null;
  dominance: { btc: number | null; eth: number | null };
}

const WRAPPED = /\b(wrapped|bridged|restaked|staked|binance-peg)\b/i;
const WRAPPED_IDS = new Set(["weth", "wbtc", "cbbtc", "steth", "wsteth", "weeth"]);

/**
 * Top coins worth a row of their own: no dollar stablecoins (the stablecoin
 * tile covers them) and no wrapped or staked copies of another coin.
 */
export function pickTopCoins(coins: CoinIn[], n = TOP_N): CoinRow[] {
  return coins
    .filter((c) => typeof c.current_price === "number")
    .filter((c) => !WRAPPED.test(c.name) && !WRAPPED_IDS.has(c.id))
    .filter((c) => !(Math.abs(c.current_price! - 1) < 0.02 && Math.abs(c.price_change_percentage_7d_in_currency ?? 0) < 2))
    .slice(0, n)
    .map((c) => {
      const prices = (c.sparkline_in_7d?.price ?? []).filter((p): p is number => typeof p === "number");
      const step = Math.max(1, Math.ceil(prices.length / SPARK_POINTS));
      return {
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        rank: c.market_cap_rank ?? null,
        price: c.current_price!,
        marketCap: c.market_cap ?? null,
        volume: c.total_volume ?? null,
        ch1h: c.price_change_percentage_1h_in_currency ?? null,
        ch24h: c.price_change_percentage_24h_in_currency ?? null,
        ch7d: c.price_change_percentage_7d_in_currency ?? null,
        fromAth: c.ath_change_percentage ?? null,
        spark: prices.filter((_, i) => i % step === 0 || i === prices.length - 1),
      };
    });
}

function opts(): FetchOpts {
  const key = process.env.COINGECKO_API_KEY?.trim();
  return { timeoutMs: 20_000, headers: key ? { "x-cg-demo-api-key": key } : undefined };
}

export const coingecko: Source = {
  id: "coingecko",
  ...SOURCE_META.coingecko,
  async run({ db, log }) {
    const now = Date.now();
    const g = (await fetchJson(`${BASE}/global`, Global, opts())).data;
    const mcap = g.total_market_cap.usd;
    if (!mcap) throw new Error("no USD market cap in /global");
    const global: CryptoGlobal = {
      mcapUsd: mcap,
      volumeUsd: g.total_volume.usd ?? null,
      mcapChange24h: g.market_cap_change_percentage_24h_usd ?? null,
      dominance: { btc: g.market_cap_percentage.btc ?? null, eth: g.market_cap_percentage.eth ?? null },
    };

    const markets = await fetchJson(
      `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&sparkline=true&price_change_percentage=1h,24h,7d`,
      z.array(Coin),
      opts(),
    );
    const top = pickTopCoins(markets);
    if (!top.length) throw new Error("no priced coins in /coins/markets");

    // Market cap in $ billions: a live quote (24h change) plus one point per day for history.
    const bn = mcap / 1e9;
    const pct = global.mcapChange24h;
    let written = upsertQuotes(db, [
      { seriesId: "cg:total_mcap", price: bn, changePct: pct, change: pct === null ? null : bn - bn / (1 + pct / 100), ts: now },
    ]);
    written += upsertSeries(db, "cg:total_mcap", "coingecko", [{ ts: dayTs(now), value: bn }]);
    if (global.dominance.btc !== null) written += upsertSeries(db, "cg:btc_dominance", "coingecko", [{ ts: dayTs(now), value: global.dominance.btc }]);
    written += replaceItems(db, "crypto_global", [{ id: "global", title: "global", ts: now, data: global }]);
    written += replaceItems(
      db,
      "crypto_top",
      top.map((c) => ({ id: c.id, title: c.name, url: `https://www.coingecko.com/en/coins/${c.id}`, ts: now, data: c })),
    );

    // Trending is a nice-to-have: its failure should not cost the market data above.
    try {
      const t = await fetchJson(`${BASE}/search/trending`, Trending, opts());
      const coins: TrendingCoin[] = t.coins.slice(0, 10).map(({ item }) => ({
        id: item.id,
        symbol: item.symbol.toUpperCase(),
        name: item.name,
        rank: item.market_cap_rank ?? null,
        price: item.data?.price ?? null,
        ch24h: item.data?.price_change_percentage_24h?.usd ?? null,
      }));
      written += replaceItems(
        db,
        "crypto_trending",
        coins.map((c) => ({ id: c.id, title: c.name, url: `https://www.coingecko.com/en/coins/${c.id}`, ts: now, data: c })),
      );
    } catch (err) {
      log(`trending: ${err instanceof Error ? err.message : err}`);
    }
    return written;
  },
};
