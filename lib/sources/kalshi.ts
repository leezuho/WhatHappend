import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Kalshi's KXFED series: market-implied odds for where the Fed funds upper
// bound lands after the next FOMC meeting (a free stand-in for CME FedWatch).
// Prices are now strings in dollars ("0.9900"); the old numeric fields are null.

const BASE = "https://api.elections.kalshi.com/trade-api/v2";

const Events = z.object({
  events: z.array(z.object({ event_ticker: z.string(), title: z.string(), strike_date: z.string().nullish() })),
});
const Markets = z.object({
  markets: z.array(
    z.object({
      ticker: z.string(),
      yes_sub_title: z.string().nullish(),
      title: z.string().nullish(),
      last_price_dollars: z.string().nullish(),
      yes_bid_dollars: z.string().nullish(),
    }),
  ),
});

export const kalshi: Source = {
  id: "kalshi",
  ...SOURCE_META.kalshi,
  async run({ db }) {
    const now = Date.now();
    const { events } = await fetchJson(`${BASE}/events?series_ticker=KXFED&status=open`, Events);
    const next = events
      .map((e) => ({ ...e, strike: Date.parse(e.strike_date ?? "") }))
      .filter((e) => Number.isFinite(e.strike) && e.strike >= now)
      .sort((a, b) => a.strike - b.strike)[0];
    if (!next) throw new Error("no open KXFED event");

    const { markets } = await fetchJson(`${BASE}/markets?event_ticker=${encodeURIComponent(next.event_ticker)}&limit=100`, Markets);
    const rows = markets
      .map((m) => {
        const strikeMatch = /-T(-?\d+(?:\.\d+)?)$/.exec(m.ticker);
        const price = Number(m.last_price_dollars || m.yes_bid_dollars);
        return {
          id: m.ticker,
          title: m.yes_sub_title || m.title || m.ticker,
          ts: next.strike,
          data: {
            prob: Number.isFinite(price) ? price : null,
            strike: strikeMatch ? Number(strikeMatch[1]) : null,
            eventTitle: next.title,
            eventTicker: next.event_ticker,
          },
        };
      })
      .sort((a, b) => (a.data.strike ?? Infinity) - (b.data.strike ?? Infinity));
    return replaceItems(db, "kalshi_fed", rows);
  },
};
