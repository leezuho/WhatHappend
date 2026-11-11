import Parser from "rss-parser";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchText } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// What people in Vietnam are searching on Google: the "Trending now" RSS of
// Google Trends. Keyless and public, but not a documented API. The feed only
// holds the ten newest trends (a few hours), so each run merges them into what
// earlier runs kept and the list covers the last WINDOW, biggest first.

const FEED = "https://trends.google.com/trending/rss?geo=VN";
const WINDOW = 24 * 3600_000;
const KEEP = 30;
const KIND = "gtrends_vn";

type NewsItem = Record<string, string[] | undefined>;
const parser: Parser<object, { traffic?: string; news?: NewsItem[] }> = new Parser({
  customFields: { item: [["ht:approx_traffic", "traffic"], ["ht:news_item", "news", { keepArray: true }]] },
});

const Item = z.object({
  title: z.string().min(1),
  pubDate: z.string(),
  traffic: z.string(),
});

export interface TrendNews {
  title: string;
  url: string;
  source: string | null;
}

export interface GtrendsItem {
  /** Lower bound Google gives ("2000+" → 2000). */
  traffic: number;
  news: TrendNews[];
}

/** "2000+", "20K+", "1,000+", "2M+" → a number. */
export function parseTraffic(raw: string): number {
  const m = raw.replace(/[,.\s]/g, "").match(/^(\d+)([KM]?)/i);
  if (!m) throw new Error(`Unexpected Google Trends traffic "${raw}"`);
  return Number(m[1]) * (m[2].toUpperCase() === "K" ? 1e3 : m[2].toUpperCase() === "M" ? 1e6 : 1);
}

function firstOf(n: NewsItem, key: string): string | null {
  return n[`ht:news_item_${key}`]?.[0]?.trim() || null;
}

export const gtrends: Source = {
  id: "gtrends",
  ...SOURCE_META.gtrends,
  async run({ db }) {
    const feed = await parser.parseString(await fetchText(FEED));
    if (!feed.items.length) throw new Error("Google Trends feed has no items");
    const now = Date.now();
    const fresh = feed.items.map((raw) => {
      const it = Item.parse(raw);
      const ts = Date.parse(it.pubDate);
      if (!Number.isFinite(ts)) throw new Error(`Unexpected Google Trends date "${it.pubDate}"`);
      const news = (raw.news ?? [])
        .map((n) => ({ title: firstOf(n, "title"), url: firstOf(n, "url"), source: firstOf(n, "source") }))
        .filter((n): n is TrendNews => !!n.title && !!n.url)
        .slice(0, 2);
      return { id: it.title.toLowerCase(), title: it.title, ts, data: { traffic: parseTraffic(it.traffic), news } satisfies GtrendsItem };
    });

    // Earlier runs' trends still inside the window; a trend seen again takes the newer numbers.
    const kept = (
      db.prepare("SELECT id, title, ts, data FROM items WHERE kind = ? AND ts >= ?").all(KIND, now - WINDOW) as {
        id: string;
        title: string;
        ts: number;
        data: string;
      }[]
    ).map((r) => ({ id: r.id, title: r.title, ts: r.ts, data: JSON.parse(r.data) as GtrendsItem }));
    const merged = new Map([...kept, ...fresh].map((t) => [t.id, t]));
    const list = [...merged.values()]
      .filter((t) => t.ts >= now - WINDOW)
      .sort((a, b) => b.data.traffic - a.data.traffic || b.ts - a.ts)
      .slice(0, KEEP);
    return replaceItems(
      db,
      KIND,
      list.map((t) => ({
        ...t,
        url: t.data.news[0]?.url ?? `https://www.google.com/search?q=${encodeURIComponent(t.title)}`,
      })),
    );
  },
};
