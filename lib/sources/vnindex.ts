import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems, upsertQuotes, upsertSeries } from "./store";
import type { Source } from "./types";

// VN-Index from SSI iBoard's public endpoints: live index + daily history.
// Yahoo only has a quote for ^VNINDEX.VN, no usable history.

const Latest = z.object({
  data: z.object({
    indexValue: z.number(),
    prevIndexValue: z.number().nullish(),
    change: z.number().nullish(),
    changePercent: z.number().nullish(),
    time: z.number().nullish(),
    advances: z.number().nullish(),
    declines: z.number().nullish(),
    nochanges: z.number().nullish(),
    totalValue: z.number().nullish(),
  }),
});

const History = z.object({ data: z.object({ t: z.array(z.number()), c: z.array(z.number()) }) });

const DAY = 24 * 3600_000;

export const vnindex: Source = {
  id: "vnindex",
  ...SOURCE_META.vnindex,
  async run({ db }) {
    const { data: d } = await fetchJson("https://iboard-query.ssi.com.vn/exchange-index/VNINDEX?hasHistory=false", Latest);
    let written = upsertQuotes(db, [
      { seriesId: "vn:VNINDEX", price: d.indexValue, change: d.change ?? null, changePct: d.changePercent ?? null, ts: d.time ?? Date.now() },
    ]);
    written += replaceItems(db, "vn_breadth", [
      { id: "VNINDEX", title: "VN-Index breadth", data: { advances: d.advances ?? null, declines: d.declines ?? null, unchanged: d.nochanges ?? null, totalValue: d.totalValue ?? null } },
    ]);

    const have = (db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = 'vn:VNINDEX'").get() as { n: number }).n;
    const to = Math.floor(Date.now() / 1000);
    const from = to - (have < 200 ? 430 : 10) * 86_400;
    const h = await fetchJson(`https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=VNINDEX&from=${from}&to=${to}`, History);
    const points = h.data.t.map((t, i) => ({ ts: Math.floor((t * 1000) / DAY) * DAY, value: h.data.c[i] }));
    written += upsertSeries(db, "vn:VNINDEX", "vnindex", points);
    return written;
  },
};
