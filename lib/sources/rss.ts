import Parser from "rss-parser";
import { SOURCE_META } from "@/config/sources";
import { FEEDS, type Feed } from "@/config/feeds";
import { tx } from "@/lib/db";
import { fetchText } from "./http";
import { hashId } from "./store";
import type { Source } from "./types";

type Media = { $?: { url?: string; medium?: string; width?: string } };
type MediaItem = {
  "media:content"?: Media[];
  "media:thumbnail"?: Media[];
};

// keepArray: The Guardian lists the same photo at 140, 460 and 700 px; the first is too small for a card.
const parser: Parser<object, MediaItem> = new Parser({
  customFields: {
    item: [
      ["media:content", "media:content", { keepArray: true }],
      ["media:thumbnail", "media:thumbnail", { keepArray: true }],
    ],
  },
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

/** Absolute http(s) URL, resolving feed-relative paths (Coin68 links "/slug/"); null if unusable. */
export function absoluteUrl(raw: string | undefined, base: string): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The widest image among media:content / media:thumbnail / enclosure, as an absolute https URL. */
export function pickImage(item: { media?: Media[]; thumbs?: Media[]; enclosure?: { url?: string; type?: string } }, base: string): string | null {
  const candidates = [...(item.media ?? []), ...(item.thumbs ?? [])]
    .filter((m) => !m.$?.medium || m.$.medium === "image")
    .map((m) => ({ url: m.$?.url, width: Number(m.$?.width) || 0 }));
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith("image/"))) candidates.push({ url: item.enclosure.url, width: 0 });
  // Widest first; a missing width sorts last but still beats nothing.
  candidates.sort((a, b) => b.width - a.width);
  for (const c of candidates) {
    const url = absoluteUrl(c.url, base);
    // The browser loads these straight from the outlet; plain http would be blocked as mixed content.
    if (url) return url.startsWith("http:") ? url.replace(/^http:/, "https:") : url;
  }
  return null;
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
    const link = absoluteUrl(it.link, feed.url);
    if (!title || !link) return [];
    const published = Date.parse(it.isoDate ?? it.pubDate ?? "") || now;
    if (now - published > MAX_AGE) return [];
    const image = pickImage({ media: it["media:content"], thumbs: it["media:thumbnail"], enclosure: it.enclosure }, feed.imageBase ?? feed.url);
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
    // Keep the image current for stories already stored (feeds swap or enlarge photos after publishing).
    const setImage = db.prepare("UPDATE articles SET image = ? WHERE id = ? AND image IS NOT ?");
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
          if (!res.changes && a.image) setImage.run(a.image, a.id, a.image);
        }
      });
      db.prepare("DELETE FROM articles WHERE published_at < ?").run(now - RETENTION);
    });
    if (failed.length) log(`${failed.length}/${FEEDS.length} feeds failed: ${failed.join(" | ")}`);
    if (failed.length === FEEDS.length) throw new Error("all feeds failed");
    return added;
  },
};
