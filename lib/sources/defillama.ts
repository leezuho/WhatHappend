import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { dayTs, replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// DefiLlama: total stablecoin supply in USD across every peg, one point per day
// (the same headline number as defillama.com/stablecoins). The endpoint always
// returns the full history (~1.3 MB), so it runs a few times a day.

const Resp = z.array(
  z.object({
    date: z.union([z.string(), z.number()]),
    totalCirculatingUSD: z.record(z.string(), z.number()),
  }),
);

const KEEP_DAYS = 430;

export function stablecoinPoints(rows: z.infer<typeof Resp>, now: number) {
  const since = now - KEEP_DAYS * 24 * 3600_000;
  return rows.flatMap((r) => {
    const ts = dayTs(Number(r.date) * 1000);
    if (!Number.isFinite(ts) || ts < since) return [];
    const total = Object.values(r.totalCirculatingUSD).reduce((a, v) => a + v, 0);
    return total > 0 ? [{ ts, value: total / 1e9 }] : [];
  });
}

// Where on-chain money sits and earns: the largest chains by total value locked,
// with TVL change over 7 and 30 days and the fees paid on each chain.

const Chains = z.array(z.object({ name: z.string(), tvl: z.number(), tokenSymbol: z.string().nullish() }));
const ChainTvl = z.array(z.object({ date: z.number(), tvl: z.number() }));
const ChainFees = z.object({ total24h: z.number().nullish(), total30d: z.number().nullish(), change_7dover7d: z.number().nullish() });

const TOP_CHAINS = 10;

export interface ChainRow {
  name: string;
  symbol: string | null;
  /** USD. */
  tvl: number;
  ch7d: number | null;
  ch30d: number | null;
  /** Fees paid on the chain, USD; null when DefiLlama has no fee page for it. */
  fees24h: number | null;
  fees30d: number | null;
  /** Last 7 days of fees against the 7 before, %. */
  feesCh7d: number | null;
}

/** % change of TVL from `days` ago in a chain's daily history (date in seconds); null when the history is shorter. */
export function tvlChange(history: { date: number; tvl: number }[], days: number): number | null {
  const last = history[history.length - 1];
  if (!last) return null;
  const then = history.findLast((p) => p.date <= last.date - days * 86_400);
  return then && then.tvl > 0 ? (last.tvl / then.tvl - 1) * 100 : null;
}

async function chains(): Promise<ChainRow[]> {
  const all = await fetchJson("https://api.llama.fi/v2/chains", Chains);
  const top = all.sort((a, b) => b.tvl - a.tvl).slice(0, TOP_CHAINS);
  return Promise.all(
    top.map(async (c) => {
      const name = encodeURIComponent(c.name);
      const [hist, fees] = await Promise.allSettled([
        fetchJson(`https://api.llama.fi/v2/historicalChainTvl/${name}`, ChainTvl),
        fetchJson(`https://api.llama.fi/overview/fees/${name}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, ChainFees, { timeoutMs: 40_000 }),
      ]);
      const h = hist.status === "fulfilled" ? hist.value : [];
      const f = fees.status === "fulfilled" ? fees.value : null;
      return {
        name: c.name,
        symbol: c.tokenSymbol ?? null,
        tvl: c.tvl,
        ch7d: tvlChange(h, 7),
        ch30d: tvlChange(h, 30),
        fees24h: f?.total24h ?? null,
        fees30d: f?.total30d ?? null,
        feesCh7d: f?.change_7dover7d ?? null,
      };
    }),
  );
}

export const defillama: Source = {
  id: "defillama",
  ...SOURCE_META.defillama,
  async run({ db, log }) {
    const [stable, chainRes] = await Promise.allSettled([fetchJson("https://stablecoins.llama.fi/stablecoincharts/all", Resp, { timeoutMs: 60_000 }), chains()]);
    let written = 0;
    const failed: string[] = [];
    if (stable.status === "fulfilled") {
      const points = stablecoinPoints(stable.value, Date.now());
      if (points.length) written += upsertSeries(db, "llama:stablecoins", "defillama", points);
      else failed.push("no recent stablecoin supply points");
    } else failed.push(`stablecoins: ${stable.reason instanceof Error ? stable.reason.message : stable.reason}`);
    if (chainRes.status === "fulfilled") {
      written += replaceItems(db, "llama_chains", chainRes.value.map((c) => ({ id: c.name, title: c.name, data: c })));
    } else failed.push(`chains: ${chainRes.reason instanceof Error ? chainRes.reason.message : chainRes.reason}`);
    if (failed.length === 2) throw new Error(failed.join(" | "));
    if (failed.length) log(failed.join(" | "));
    return written;
  },
};
