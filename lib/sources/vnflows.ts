import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { VN_FOREIGN } from "@/config/vietnam";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Foreign investors' buying and selling on HOSE, in VND, per trading day
// (VNDirect's public finfo API, history back to 2018). Today's row is live
// during the session. SSI's index feed only has share counts.

const Resp = z.object({
  data: z.array(
    z.object({
      code: z.string(),
      tradingDate: z.string(),
      buyVal: z.number(),
      sellVal: z.number(),
      netVal: z.number(),
    }),
  ),
});

export const vnflows: Source = {
  id: "vnflows",
  ...SOURCE_META.vnflows,
  async run({ db }) {
    const have = (db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?").get(VN_FOREIGN.net) as { n: number }).n;
    const r = await fetchJson(`https://api-finfo.vndirect.com.vn/v4/foreigns?q=code:VNINDEX&sort=tradingDate&size=${have < 200 ? 400 : 10}`, Resp);
    const rows = r.data.filter((x) => x.code === "VNINDEX");
    if (!rows.length) throw new Error("no VNINDEX rows");
    const pts = (f: (x: (typeof rows)[number]) => number) => rows.map((x) => ({ ts: Date.parse(`${x.tradingDate}T00:00:00Z`), value: f(x) }));
    return (
      upsertSeries(db, VN_FOREIGN.net, "vnflows", pts((x) => x.netVal)) +
      upsertSeries(db, VN_FOREIGN.buy, "vnflows", pts((x) => x.buyVal)) +
      upsertSeries(db, VN_FOREIGN.sell, "vnflows", pts((x) => x.sellVal))
    );
  },
};
