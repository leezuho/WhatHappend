import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Vietnamese gold prices (VND per lượng). sjc.com.vn sits behind a Cloudflare
// challenge, so we read the aggregator vang.today and fall back to PNJ.

const VangToday = z.object({
  success: z.boolean(),
  timestamp: z.number().nullish(),
  prices: z.record(
    z.string(),
    z.object({ name: z.string(), buy: z.number().nullish(), sell: z.number().nullish(), change_buy: z.number().nullish(), change_sell: z.number().nullish(), currency: z.string().nullish() }),
  ),
});

const Pnj = z.object({
  // Products we don't show may carry "" instead of a price (e.g. raw-gold buyback rows).
  data: z.array(z.object({ masp: z.string(), tensp: z.string(), giaban: z.unknown(), giamua: z.unknown() })),
});

export interface GoldQuote {
  code: string;
  name: string;
  buy: number | null;
  sell: number | null;
  changeSell: number | null;
  source: string;
}

const WANTED = ["SJL1L10", "SJ9999", "DOHNL", "BTSJC"];

async function fromVangToday(): Promise<GoldQuote[]> {
  const r = await fetchJson("https://www.vang.today/api/prices", VangToday);
  if (!r.success) throw new Error("vang.today success=false");
  return WANTED.flatMap((code) => {
    const p = r.prices[code];
    return p ? [{ code, name: p.name, buy: p.buy ?? null, sell: p.sell ?? null, changeSell: p.change_sell ?? null, source: "vang.today" }] : [];
  });
}

const PNJ_CODES: Record<string, string> = { SJC: "SJL1L10", N24K: "PNJ24K" };

/** The SJC bar and PNJ ring rows; a price that is not a positive number fails the run. */
export function pnjQuotes(data: z.infer<typeof Pnj>["data"]): GoldQuote[] {
  return data
    .filter((x) => x.masp in PNJ_CODES)
    .map((x) => {
      const { giaban: sell, giamua: buy } = x;
      if (typeof sell !== "number" || typeof buy !== "number" || sell <= 0 || buy <= 0) {
        throw new Error(`PNJ ${x.masp}: unexpected price ${JSON.stringify({ sell, buy })}`);
      }
      // PNJ quotes thousand VND per chỉ; 1 lượng = 10 chỉ.
      return { code: PNJ_CODES[x.masp], name: x.tensp, buy: buy * 10_000, sell: sell * 10_000, changeSell: null, source: "PNJ" };
    });
}

async function fromPnj(): Promise<GoldQuote[]> {
  const r = await fetchJson("https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00", Pnj);
  const quotes = pnjQuotes(r.data);
  if (!quotes.length) throw new Error("PNJ: no SJC or 24K ring row");
  return quotes;
}

export const sjc: Source = {
  id: "sjc",
  ...SOURCE_META.sjc,
  async run({ db, log }) {
    let quotes: GoldQuote[];
    try {
      quotes = await fromVangToday();
      if (!quotes.some((q) => q.code === "SJL1L10")) throw new Error("SJC bar missing");
    } catch (err) {
      log(`vang.today failed (${err instanceof Error ? err.message : err}); using PNJ`);
      quotes = await fromPnj();
    }
    const now = Date.now();
    const hour = Math.floor(now / 3600_000) * 3600_000;
    let written = replaceItems(db, "gold_vn", quotes.map((q) => ({ id: q.code, title: q.name, ts: now, data: q })));
    for (const q of quotes) if (q.sell) written += upsertSeries(db, `goldvn:${q.code}:sell`, "sjc", [{ ts: hour, value: q.sell }]);
    return written;
  },
};
