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

export const polymarket: Source = {
  id: "polymarket",
  ...SOURCE_META.polymarket,
  async run({ db }) {
    const byId = new Map<string, { tag: string; e: z.infer<typeof Event> }>();
    for (const tag of ["geopolitics", "economy"]) {
      const url = `https://gamma-api.polymarket.com/events?tag_slug=${tag}&active=true&closed=false&order=volume24hr&ascending=false&limit=15`;
      for (const e of await fetchJson(url, Resp, { timeoutMs: 30_000 })) {
        const id = String(e.id);
        if (!byId.has(id)) byId.set(id, { tag, e });
      }
    }
    const top = [...byId.values()]
      .map(({ tag, e }) => ({ tag, e, outcomes: outcomesOf(e.markets ?? []) }))
      .filter((x) => x.outcomes.length)
      .sort((a, b) => (b.e.volume24hr ?? 0) - (a.e.volume24hr ?? 0))
      .slice(0, 12);
    return replaceItems(
      db,
      "polymarket",
      top.map(({ tag, e, outcomes }) => ({
        id: String(e.id),
        title: e.title,
        url: `https://polymarket.com/event/${e.slug}`,
        ts: e.endDate ? Date.parse(e.endDate) || null : null,
        data: { tag, volume24hr: e.volume24hr ?? 0, outcomes },
      })),
    );
  },
};
