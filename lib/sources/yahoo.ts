import YahooFinance from "yahoo-finance2";
import { SOURCE_META } from "@/config/sources";
import { YAHOO_SYMBOLS } from "@/config/series";
import { TECH_SYMBOLS } from "@/config/tech";
import { replaceItems, upsertQuotes, upsertSeries, type QuoteRow } from "./store";
import type { Source } from "./types";

// Quotes for every Yahoo symbol each run (one batched call); daily history at
// most hourly. A symbol with little stored history gets a ~14-month backfill
// so the risk-regime z-scores have a full year to work with.

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const HISTORY_EVERY = 60 * 60_000;
const BACKFILL_DAYS = 430;
const DAY = 24 * 3600_000;
const TECH = new Set(TECH_SYMBOLS);

export interface TechCap {
  /** In the listing's own currency. */
  cap: number;
  currency: string | null;
}

/** Calendar date of a bar in the exchange's own timezone, as midnight UTC. */
function barDay(date: Date, tz: string | undefined): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export const yahoo: Source = {
  id: "yahoo",
  ...SOURCE_META.yahoo,
  async run({ db, log }) {
    const quotes = await yf.quote(YAHOO_SYMBOLS, { return: "array" });
    const rows: QuoteRow[] = quotes.flatMap((q) =>
      typeof q.regularMarketPrice === "number"
        ? [
            {
              seriesId: `yahoo:${q.symbol}`,
              price: q.regularMarketPrice,
              change: q.regularMarketChange ?? null,
              changePct: q.regularMarketChangePercent ?? null,
              marketState: q.marketState ?? null,
              ts: q.regularMarketTime instanceof Date ? q.regularMarketTime.getTime() : Date.now(),
            },
          ]
        : [],
    );
    const missing = YAHOO_SYMBOLS.filter((s) => !rows.some((r) => r.seriesId === `yahoo:${s}`));
    if (missing.length) log(`no quote for: ${missing.join(", ")}`);
    let written = upsertQuotes(db, rows);

    // Market cap and trading currency of the tech page's stocks (the quotes table keeps only prices).
    const caps = quotes.flatMap((q) =>
      TECH.has(q.symbol) && typeof q.marketCap === "number" ? [{ id: q.symbol, title: q.symbol, data: { cap: q.marketCap, currency: q.currency ?? null } satisfies TechCap }] : [],
    );
    if (caps.length) replaceItems(db, "tech_caps", caps);

    const last = db.prepare("SELECT value FROM kv WHERE key = 'yahoo:history'").get() as { value: string } | undefined;
    if (last && Date.now() - Number(last.value) < HISTORY_EVERY) return written;

    const count = db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?");
    for (const symbol of YAHOO_SYMBOLS) {
      const id = `yahoo:${symbol}`;
      const have = (count.get(id) as { n: number }).n;
      // Yahoo rewrites a stock's whole history after a split (FPT splits most years), so the tech page's stocks
      // re-pull the full window each time; indices, FX and futures never split and only top up the last days.
      const days = have < 200 || TECH.has(symbol) ? BACKFILL_DAYS : 10;
      try {
        const chart = await yf.chart(symbol, { period1: new Date(Date.now() - days * DAY), interval: "1d" });
        const tz = chart.meta.exchangeTimezoneName;
        const points = chart.quotes.flatMap((b) => (typeof b.close === "number" ? [{ ts: barDay(b.date, tz), value: b.close }] : []));
        written += upsertSeries(db, id, "yahoo", points);
      } catch (err) {
        log(`history ${symbol}: ${err instanceof Error ? err.message : err}`);
      }
    }
    db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES ('yahoo:history', ?, ?)").run(String(Date.now()), Date.now());
    return written;
  },
};
