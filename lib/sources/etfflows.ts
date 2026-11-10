import { SOURCE_META } from "@/config/sources";
import { BTC_ETF } from "@/config/series";
import { fetchText, tableRows } from "./http";
import { replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Daily net flows of the US spot Bitcoin ETFs, $ million, from bitbo.io's
// server-rendered table (one column per fund plus the total, about the last
// ten trading days). Farside sits behind Cloudflare and SoSoValue needs a key.
// The table keeps no long history, so totals are stored as a series that
// grows by a day at a time.

export interface EtfDay {
  ts: number;
  /** Net flow per fund ticker, $M. */
  funds: Record<string, number>;
  total: number;
}

/** Rows of the flow table: a header naming the funds, then dated rows ("Nov 06, 2026"); summary rows (Maximum, Minimum…) are skipped. */
export function parseEtfTable(rows: string[][]): EtfDay[] {
  const head = rows.find((r) => r[0] === "Date");
  if (!head || head[head.length - 1] !== "Totals") throw new Error("flow table header not found");
  const funds = head.slice(1, -1);
  return rows.flatMap((r) => {
    const ts = Date.parse(`${r[0]} UTC`);
    if (!/^[A-Z][a-z]{2} \d{2}, \d{4}$/.test(r[0]) || !Number.isFinite(ts) || r.length !== head.length) return [];
    const nums = r.slice(1).map((c) => Number(c.replace(/,/g, "")));
    if (nums.some((n) => !Number.isFinite(n))) throw new Error(`unparsable flow row ${r.join(" ")}`);
    return [{ ts, funds: Object.fromEntries(funds.map((f, i) => [f, nums[i]])), total: nums[nums.length - 1] }];
  });
}

export const etfflows: Source = {
  id: "etfflows",
  ...SOURCE_META.etfflows,
  async run({ db }) {
    const days = parseEtfTable(tableRows(await fetchText("https://bitbo.io/treasuries/etf-flows/", { timeoutMs: 30_000 })));
    if (!days.length) throw new Error("no dated flow rows");
    let written = upsertSeries(
      db,
      BTC_ETF.total,
      "etfflows",
      days.map((d) => ({ ts: d.ts, value: d.total })),
    );
    for (const fund of BTC_ETF.funds) {
      written += upsertSeries(
        db,
        `${BTC_ETF.prefix}${fund}`,
        "etfflows",
        days.flatMap((d) => (fund in d.funds ? [{ ts: d.ts, value: d.funds[fund] }] : [])),
      );
    }
    const latest = days.reduce((a, b) => (b.ts > a.ts ? b : a));
    written += replaceItems(db, "btc_etf_latest", [{ id: "latest", title: "Spot bitcoin ETF flows", ts: latest.ts, data: latest }]);
    return written;
  },
};
