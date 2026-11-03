import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { dayTs, upsertSeries } from "./store";
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

export const defillama: Source = {
  id: "defillama",
  ...SOURCE_META.defillama,
  async run({ db }) {
    const rows = await fetchJson("https://stablecoins.llama.fi/stablecoincharts/all", Resp, { timeoutMs: 60_000 });
    const points = stablecoinPoints(rows, Date.now());
    if (!points.length) throw new Error("no recent stablecoin supply points");
    return upsertSeries(db, "llama:stablecoins", "defillama", points);
  },
};
