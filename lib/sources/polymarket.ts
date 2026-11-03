import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Polymarket (Gamma API): the most-traded open geopolitics and economy events.
// Always filter by tag: the unfiltered list is ~19 MB of nested sports markets.

const Market = z.object({
  question: z.string().nullish(),
  groupItemTitle: z.string().nullish(),
  outcomes: z.string().nullish(),
  outcomePrices: z.string().nullish(),
  oneDayPriceChange: z.number().nullish(),
  closed: z.boolean().nullish(),
});
const Event = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string(),
  title: z.string(),
  endDate: z.string().nullish(),
  volume24hr: z.number().nullish(),
  markets: z.array(Market).nullish(),
});
const Resp = z.array(Event);

export interface Outcome {
  label: string;
  prob: number;
  change24h: number | null;
}

function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function outcomesOf(markets: z.infer<typeof Market>[]): Outcome[] {
  const open = markets.filter((m) => m.closed === false);
  if (open.length === 1) {
    const m = open[0];
    const labels = parseList(m.outcomes);
    const prices = parseList(m.outcomePrices).map(Number);
    const yes = labels.findIndex((l) => l.toLowerCase() === "yes");
    if (yes >= 0 && Number.isFinite(prices[yes])) return [{ label: "Yes", prob: prices[yes], change24h: m.oneDayPriceChange ?? null }];
    return labels
      .map((label, i) => ({ label, prob: prices[i], change24h: null }))
      .filter((o) => Number.isFinite(o.prob))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 4);
  }
  return open
    .map((m) => ({ label: (m.groupItemTitle || m.question || "?").trim(), prob: Number(parseList(m.outcomePrices)[0]), change24h: m.oneDayPriceChange ?? null }))
    .filter((o) => Number.isFinite(o.prob))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 4);
}

type Ev = z.infer<typeof Event>;

const eventsUrl = (tag: string, limit: number) =>
  `https://gamma-api.polymarket.com/events?tag_slug=${tag}&active=true&closed=false&order=volume24hr&ascending=false&limit=${limit}`;

function toItems(list: { tag: string; e: Ev }[], n: number, keep: (e: Ev) => boolean = () => true) {
  return list
    .filter(({ e }) => keep(e))
    .map(({ tag, e }) => ({ tag, e, outcomes: outcomesOf(e.markets ?? []) }))
    .filter((x) => x.outcomes.length)
    .sort((a, b) => (b.e.volume24hr ?? 0) - (a.e.volume24hr ?? 0))
    .slice(0, n)
    .map(({ tag, e, outcomes }) => ({
      id: String(e.id),
      title: e.title,
      url: `https://polymarket.com/event/${e.slug}`,
      ts: e.endDate ? Date.parse(e.endDate) || null : null,
      data: { tag, volume24hr: e.volume24hr ?? 0, outcomes },
    }));
}

/** Crypto's top volume is "BTC up or down today"-style markets; keep the ones with a horizon. */
const MIN_CRYPTO_HORIZON = 2 * 24 * 3600_000;

export const polymarket: Source = {
  id: "polymarket",
  ...SOURCE_META.polymarket,
  async run({ db }) {
    const byId = new Map<string, { tag: string; e: Ev }>();
    for (const tag of ["geopolitics", "economy"]) {
      for (const e of await fetchJson(eventsUrl(tag, 15), Resp, { timeoutMs: 30_000 })) {
        const id = String(e.id);
        if (!byId.has(id)) byId.set(id, { tag, e });
      }
    }
    const crypto = (await fetchJson(eventsUrl("crypto", 40), Resp, { timeoutMs: 30_000 })).map((e) => ({ tag: "crypto", e }));
    const now = Date.now();
    const longDated = (e: Ev) => !e.endDate || Date.parse(e.endDate) - now > MIN_CRYPTO_HORIZON;
    return (
      replaceItems(db, "polymarket", toItems([...byId.values()], 12)) +
      replaceItems(db, "polymarket_crypto", toItems(crypto, 8, longDated))
    );
  },
};
