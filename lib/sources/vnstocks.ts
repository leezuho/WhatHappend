import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { VN_INDICES } from "@/config/vietnam";
import { fetchJson } from "./http";
import { replaceItems, upsertQuotes, upsertSeries } from "./store";
import type { Source } from "./types";

// Vietnam's other indices (VN30, HNX-Index, UPCoM) and the VN30 stocks for the
// Vietnam page's market map. Live levels and the stocks come from SSI iBoard
// (prices in VND); daily index history from VNDirect, because SSI's chart
// history returns HNX and UPCoM divided by 1000. Shares outstanding come from
// VNDirect once a day, so market cap = live price × shares.

const DAY = 24 * 3600_000;

const IndexLatest = z.object({
  data: z.object({
    indexValue: z.number(),
    change: z.number().nullish(),
    changePercent: z.number().nullish(),
    time: z.number().nullish(),
  }),
});

const VndPrices = z.object({ data: z.array(z.object({ code: z.string(), date: z.string(), close: z.number() })) });

const Group = z.object({
  data: z.array(
    z.object({
      stockSymbol: z.string(),
      companyNameVi: z.string().nullish(),
      companyNameEn: z.string().nullish(),
      matchedPrice: z.number().nullish(),
      refPrice: z.number().nullish(),
      priceChangePercent: z.number().nullish(),
      nmTotalTradedValue: z.number().nullish(),
      buyForeignValue: z.number().nullish(),
      sellForeignValue: z.number().nullish(),
    }),
  ),
});

const Ratios = z.object({ data: z.array(z.object({ code: z.string(), ratioCode: z.string(), value: z.number() })) });

export interface Vn30Stock {
  symbol: string;
  name: { en: string; vi: string };
  /** Last matched price in VND (the reference price before the open). */
  price: number;
  changePct: number | null;
  /** Order-matched value traded today, VND. */
  traded: number | null;
  /** Foreign buy − sell value today, VND. */
  foreignNet: number | null;
  /** price × shares outstanding, VND; null until VNDirect has the share count. */
  mcap: number | null;
}

const SHARES_KEY = "vnstocks:shares";

/** Shares outstanding per VN30 symbol, refreshed from VNDirect at most once a day and kept in `kv`. */
async function shares(db: DatabaseSync, symbols: string[], log: (m: string) => void): Promise<Record<string, number>> {
  const row = db.prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(SHARES_KEY) as { value: string | null; updated_at: number } | undefined;
  const cached: Record<string, number> = row?.value ? JSON.parse(row.value) : {};
  const fresh = row && Date.now() - row.updated_at < DAY && symbols.every((s) => s in cached);
  if (fresh) return cached;
  try {
    const url = `https://api-finfo.vndirect.com.vn/v4/ratios/latest?order=reportDate&where=code:${symbols.join(",")}&filter=itemCode:51004`;
    const r = await fetchJson(url, Ratios);
    const out = Object.fromEntries(r.data.filter((x) => x.ratioCode === "OUTSTANDING_SHARES" && x.value > 0).map((x) => [x.code, x.value]));
    if (!Object.keys(out).length) throw new Error("no OUTSTANDING_SHARES rows");
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      SHARES_KEY,
      JSON.stringify(out),
      Date.now(),
    );
    return out;
  } catch (err) {
    // Yesterday's share counts still size the map; only a first run without any fails the cells.
    log(`shares: ${err instanceof Error ? err.message : err}`);
    return cached;
  }
}

/** VN30 rows as stored: price falls back to the reference price before the first match of the day. */
export function vn30Rows(data: z.infer<typeof Group>["data"], sharesBySymbol: Record<string, number>): Vn30Stock[] {
  return data.flatMap((s) => {
    const price = s.matchedPrice || s.refPrice;
    if (!price) return [];
    const n = sharesBySymbol[s.stockSymbol];
    const buy = s.buyForeignValue ?? null;
    const sell = s.sellForeignValue ?? null;
    return [
      {
        symbol: s.stockSymbol,
        name: { en: s.companyNameEn ?? s.stockSymbol, vi: s.companyNameVi ?? s.stockSymbol },
        price,
        changePct: s.matchedPrice ? (s.priceChangePercent ?? null) : 0,
        traded: s.nmTotalTradedValue ?? null,
        foreignNet: buy === null || sell === null ? null : buy - sell,
        mcap: n ? price * n : null,
      },
    ];
  });
}

export const vnstocks: Source = {
  id: "vnstocks",
  ...SOURCE_META.vnstocks,
  async run({ db, log }) {
    let written = 0;
    for (const ix of VN_INDICES) {
      const { data: d } = await fetchJson(`https://iboard-query.ssi.com.vn/exchange-index/${ix.ssi}?hasHistory=false`, IndexLatest);
      written += upsertQuotes(db, [{ seriesId: ix.id, price: d.indexValue, change: d.change ?? null, changePct: d.changePercent ?? null, ts: d.time ?? Date.now() }]);
      const have = (db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?").get(ix.id) as { n: number }).n;
      const h = await fetchJson(`https://api-finfo.vndirect.com.vn/v4/vnmarket_prices?sort=date:desc&q=code:${ix.vnd}&size=${have < 200 ? 300 : 5}`, VndPrices);
      written += upsertSeries(
        db,
        ix.id,
        "vnstocks",
        h.data.map((p) => ({ ts: Date.parse(`${p.date}T00:00:00Z`), value: p.close })),
      );
    }
    const group = await fetchJson("https://iboard-query.ssi.com.vn/stock/group/VN30", Group);
    if (group.data.length < 25) throw new Error(`VN30 group has ${group.data.length} stocks`);
    const rows = vn30Rows(group.data, await shares(db, group.data.map((s) => s.stockSymbol), log));
    written += replaceItems(
      db,
      "vn30",
      rows.map((r) => ({ id: r.symbol, title: r.symbol, data: r })),
    );
    return written;
  },
};
