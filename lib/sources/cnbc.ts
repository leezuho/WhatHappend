import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { CNBC_SYMBOLS } from "@/config/countries";
import { fetchJson } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Daily government bond yields from CNBC's chart service (unofficial, no key)
// for the countries whose OECD 10-year series has stopped (Indonesia since
// 12/2024). The 1Y chart returns about two years of daily bars; we keep the
// close, which CNBC quotes as a yield in %.

const Bar = z.object({ close: z.string(), tradeTime: z.string() });
const Resp = z.object({ barData: z.object({ priceBars: z.array(Bar) }) });

/** CNBC price bars → daily points (UTC midnight of the trade date), oldest first. */
export function parseCnbcBars(bars: z.infer<typeof Bar>[]): Point[] {
  return bars
    .flatMap((b) => {
      const m = /^(\d{4})(\d{2})(\d{2})/.exec(b.tradeTime);
      const value = Number(b.close);
      return m && b.close && Number.isFinite(value) ? [{ ts: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])), value }] : [];
    })
    .sort((a, b) => a.ts - b.ts);
}

export const cnbc: Source = {
  id: "cnbc",
  ...SOURCE_META.cnbc,
  async run({ db, log }) {
    let written = 0;
    const failed: string[] = [];
    for (const symbol of CNBC_SYMBOLS) {
      try {
        const data = await fetchJson(`https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(symbol)}`, Resp, {
          timeoutMs: 30_000,
          browserUA: true,
        });
        const points = parseCnbcBars(data.barData.priceBars);
        if (!points.length) throw new Error("no bars");
        written += upsertSeries(db, `cnbc:${symbol}`, "cnbc", points);
      } catch (err) {
        failed.push(`${symbol}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (failed.length) log(`failed: ${failed.join(" | ")}`);
    if (failed.length === CNBC_SYMBOLS.length && failed.length) throw new Error(failed.join(" | "));
    return written;
  },
};
