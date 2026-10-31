import Parser from "rss-parser";
import { SOURCE_META } from "@/config/sources";
import { FEEDS, type Feed } from "@/config/feeds";
import { tx } from "@/lib/db";
import { fetchText } from "./http";
import { hashId } from "./store";
import type { Source } from "./types";

type MediaItem = {
  "media:content"?: { $?: { url?: string; medium?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
};

const parser: Parser<object, MediaItem> = new Parser({
  customFields: { item: ["media:content", "media:thumbnail"] },
});

const MAX_AGE = 3 * 24 * 3600_000;
const RETENTION = 14 * 24 * 3600_000;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|ref|cmpid|ito)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

/** Lowercased, accent-free, punctuation-free title prefix used to spot the same story across sources. */
export function titleKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function stripHtml(s: string | undefined): string | null {
  if (!s) return null;
  const text = s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 400) : null;
}

async function readFeed(feed: Feed) {
  const xml = await fetchText(feed.url, { browserUA: feed.browserUA, timeoutMs: 15_000 });
  const parsed = await parser.parseString(xml);
  const now = Date.now();
  return parsed.items.flatMap((it) => {
    const title = it.title?.replace(/\s+/g, " ").trim();
    const link = it.link?.trim();
    if (!title || !link) return [];
    const published = Date.parse(it.isoDate ?? it.pubDate ?? "") || now;
    if (now - published > MAX_AGE) return [];
    const image = it["media:content"]?.$?.url ?? it["media:thumbnail"]?.$?.url ?? it.enclosure?.url ?? null;
    const url = normalizeUrl(link);
    return [
      {
        id: hashId(url),
        url,
        source: feed.name,
        lang: feed.lang,
        region: feed.region ?? null,
        title,
        titleKey: titleKey(title),
        summary: stripHtml(it.contentSnippet ?? it.content ?? it.summary),
        image,
        published: Math.min(published, now),
      },
    ];
  });
}

export const rss: Source = {
  id: "rss",
  ...SOURCE_META.rss,
  async run({ db, log }) {
    const results = await Promise.allSettled(FEEDS.map(readFeed));
    const failed: string[] = [];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO articles (id, url, source, lang, region, title, title_en, title_vi, title_key, summary, image, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    let added = 0;
    tx(db, () => {
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          failed.push(`${FEEDS[i].name}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
          return;
        }
        for (const a of r.value) {
          const res = insert.run(
            a.id, a.url, a.source, a.lang, a.region, a.title,
            a.lang === "en" ? a.title : null,
            a.lang === "vi" ? a.title : null,
            a.titleKey, a.summary, a.image, a.published, now,
          );
          added += Number(res.changes);
        }
      });
      db.prepare("DELETE FROM articles WHERE published_at < ?").run(now - RETENTION);
    });
    if (failed.length) log(`${failed.length}/${FEEDS.length} feeds failed: ${failed.join(" | ")}`);
    if (failed.length === FEEDS.length) throw new Error("all feeds failed");
    return added;
  },
};
