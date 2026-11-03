import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { dayTs, upsertSeries } from "./store";
import type { Source } from "./types";

// Deribit DVOL: 30-day implied volatility of BTC options, daily candles.
// Public endpoint, no key; the current day's candle updates until 00:00 UTC.

const Resp = z.object({
  result: z.object({
    data: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])),
  }),
});

const DAY = 24 * 3600_000;
const BACKFILL_DAYS = 430;

export const deribit: Source = {
  id: "deribit",
  ...SOURCE_META.deribit,
  async run({ db }) {
    const id = "deribit:DVOL-BTC";
    const have = (db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?").get(id) as { n: number }).n;
    const now = Date.now();
    const start = now - (have < 200 ? BACKFILL_DAYS : 10) * DAY;
    const r = await fetchJson(
      `https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=1D&start_timestamp=${start}&end_timestamp=${now}`,
      Resp,
    );
    // [ts, open, high, low, close]
    const points = r.result.data.map(([ts, , , , close]) => ({ ts: dayTs(ts), value: close }));
    if (!points.length) throw new Error("no DVOL candles returned");
    return upsertSeries(db, id, "deribit", points);
  },
};
