import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { SOURCE_META } from "@/config/sources";
import { SERIES, VITAL_SIGNS } from "@/config/series";
import { getTile } from "@/lib/data/series";
import type { Source } from "@/lib/sources/types";
import { generateJson } from "./provider";
import { FORCE_KEY, type StoredBrief } from "./brief-shared";

// The daily brief: once a day after 06:00 Vietnam time (or on demand from the
// UI), the "brief" model reads the last 24h of deduplicated headlines plus the market
// snapshot and writes a short bilingual summary that cites its headlines.

const TZ = "Asia/Ho_Chi_Minh";
const BRIEF_HOUR = 6;
const MIN_HEADLINES = 15;
const MAX_HEADLINES = 90;

const BriefLang = z.object({
  headline: z.string(),
  bullets: z.array(z.object({ title: z.string(), body: z.string(), refs: z.array(z.number()) })),
  watch: z.array(z.string()),
});
const BriefOut = z.object({ vi: BriefLang, en: BriefLang });

const SYSTEM = `You write the morning world brief for one reader's personal dashboard. The reader wants to understand, in under two minutes, what happened in the world in the last 24 hours and why it matters.

Work only from the numbered headlines and the market snapshot you are given. Do not add facts, numbers or events that are not in them; if something is unclear from a headline, say less rather than guess. Do not add titles, roles or descriptors for people or organisations (e.g. "former", "acting") unless the headline states them.

Write:
- headline: one sentence capturing the day.
- bullets: the 5 to 7 most consequential stories, most important first. Merge headlines about the same story. Each has a short title and a 1–3 sentence body saying what happened and why it matters. refs lists the numbers of the headlines it is based on.
- watch: 2 to 4 short items worth watching in the next day or two, grounded in the inputs.
Weigh geopolitics, macro/markets, and large human impact over celebrity and sports. Mention a market move only if the snapshot shows it. No investment advice.

Produce the same brief twice: "en" in English and "vi" in natural Vietnamese (standard Vietnamese names for countries, e.g. Mỹ, Trung Quốc, Nga). Both versions cover the same stories with the same refs.`;

export function vnDate(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

function vnHour(now: number): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now));
}

export interface HeadlineRow {
  title: string;
  url: string;
  source: string;
  region: string | null;
  topic: string | null;
  published_at: number;
}

/** Last 24h of headlines (English where available), one per story, newest first, no sports. */
export function recentHeadlines(db: DatabaseSync, now: number, limit = MAX_HEADLINES): HeadlineRow[] {
  return db
    .prepare(
      `SELECT COALESCE(title_en, title) AS title, url, source, region, topic, MAX(published_at) AS published_at
       FROM articles WHERE published_at >= ? AND (topic IS NULL OR topic != 'sports')
       GROUP BY title_key ORDER BY published_at DESC LIMIT ?`,
    )
    .all(now - 24 * 3600_000, limit) as unknown as HeadlineRow[];
}

function forcedAt(db: DatabaseSync): number {
  const row = db.prepare("SELECT updated_at FROM kv WHERE key = ?").get(FORCE_KEY) as { updated_at: number } | undefined;
  return row?.updated_at ?? 0;
}

export const brief: Source = {
  id: "brief",
  ...SOURCE_META.brief,
  isDue(now, status, db) {
    if (status && !status.ok && now - status.last_run < 30 * 60_000) return false;
    const latest = db.prepare("SELECT MAX(created_at) AS t FROM briefs").get() as { t: number | null };
    const forced = forcedAt(db) > (latest.t ?? 0);
    const missingToday = !db.prepare("SELECT 1 FROM briefs WHERE date = ?").get(vnDate(now)) && vnHour(now) >= BRIEF_HOUR;
    if (!forced && !missingToday) return false;
    const n = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE published_at >= ?").get(now - 24 * 3600_000) as { n: number };
    return n.n >= MIN_HEADLINES;
  },
  async run({ db, log }) {
    const now = Date.now();
    const headlines = recentHeadlines(db, now);
    const markets = VITAL_SIGNS.flatMap((k) => {
      const t = getTile(db, SERIES[k]);
      if (!t) return [];
      return [{ name: SERIES[k].name.en, value: Number(t.value.toFixed(SERIES[k].digits)), changePct: t.changePct === null ? null : Number(t.changePct.toFixed(2)) }];
    });
    const events = db
      .prepare("SELECT title, type, level FROM events WHERE ts >= ? AND (level IN ('orange','red') OR (type = 'earthquake' AND severity >= 6)) ORDER BY ts DESC LIMIT 15")
      .all(now - 48 * 3600_000);

    const input = {
      date: vnDate(now),
      headlines: headlines.map((h, i) => ({ n: i + 1, source: h.source, region: h.region, topic: h.topic, title: h.title })),
      markets,
      disasters: events,
    };

    const res = await generateJson({ tier: "brief", system: SYSTEM, user: JSON.stringify(input), schema: BriefOut });
    if (!res.data) throw new Error(`brief not produced by ${res.model} (stop_reason=${res.stopReason})`);
    const out = res.data;

    const toStored = (b: z.infer<typeof BriefLang>): StoredBrief => ({
      headline: b.headline,
      bullets: b.bullets.map((x) => ({
        title: x.title,
        body: x.body,
        // One chip per outlet: the first referenced headline from each.
        sources: [...new Map(x.refs.map((n) => headlines[n - 1]).filter(Boolean).map((h) => [h.source, h])).values()]
          .slice(0, 4)
          .map((h) => ({ title: h.title, url: h.url, source: h.source })),
      })),
      watch: b.watch,
      model: res.model,
      headlineCount: headlines.length,
    });

    const date = vnDate(now);
    const ins = db.prepare("INSERT OR REPLACE INTO briefs (date, lang, content, created_at) VALUES (?, ?, ?, ?)");
    ins.run(date, "en", JSON.stringify(toStored(out.en)), now);
    ins.run(date, "vi", JSON.stringify(toStored(out.vi)), now);
    log(`brief for ${date} by ${res.model} from ${headlines.length} headlines (${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)`);
    return 2;
  },
};
