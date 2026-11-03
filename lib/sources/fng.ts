import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { dayTs, replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Crypto Fear & Greed Index (alternative.me), one reading per day. The first
// run backfills ~14 months so the 1-year high/low and move rules can work.

const Resp = z.object({
  data: z.array(z.object({ value: z.string(), value_classification: z.string(), timestamp: z.string() })),
});

const BACKFILL_DAYS = 430;

export const fng: Source = {
  id: "fng",
  ...SOURCE_META.fng,
  async run({ db }) {
    const have = (db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = 'fng:crypto'").get() as { n: number }).n;
    const r = await fetchJson(`https://api.alternative.me/fng/?limit=${have < 200 ? BACKFILL_DAYS : 10}`, Resp);
    const points = r.data
      .map((d) => ({ ts: dayTs(Number(d.timestamp) * 1000), value: Number(d.value) }))
      .filter((p) => Number.isFinite(p.ts) && p.value >= 0 && p.value <= 100);
    if (!points.length) throw new Error("no readings in the Fear & Greed response");
    const latest = r.data[0];
    let written = upsertSeries(db, "fng:crypto", "fng", points);
    written += replaceItems(db, "crypto_fng", [
      { id: "latest", title: latest.value_classification, ts: Number(latest.timestamp) * 1000, data: { value: Number(latest.value), label: latest.value_classification } },
    ]);
    return written;
  },
};
