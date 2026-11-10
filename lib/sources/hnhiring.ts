import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { HN_HIRING_ID } from "@/config/tech";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Job posts per month in Hacker News' "Ask HN: Who is hiring?" threads, a
// long-running read on tech hiring. Algolia finds the threads (posted by the
// whoishiring account on the first weekday of the month); the official HN API
// gives each thread's top-level comments (`kids`), one per job post. A thread
// keeps filling up for weeks, so only finished months are stored: a partial
// month next to a full one would read as a collapse in hiring.

const Search = z.object({ hits: z.array(z.object({ objectID: z.string(), title: z.string().nullish() })) });
const Item = z.object({ kids: z.array(z.number()).nullish() });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Ask HN: Who is hiring? (November 2026)" → 1 November 2026, UTC; null for the other threads of the account. */
export function hiringMonth(title: string): number | null {
  const m = /^Ask HN: Who is hiring\? \((\w+) (\d{4})\)$/.exec(title.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  return month < 0 ? null : Date.UTC(Number(m[2]), month, 1);
}

export const hnhiring: Source = {
  id: "hnhiring",
  ...SOURCE_META.hnhiring,
  async run({ db }) {
    const s = await fetchJson("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=100", Search);
    const threads = s.hits.flatMap((h) => {
      const ts = h.title ? hiringMonth(h.title) : null;
      return ts === null ? [] : [{ id: h.objectID, ts }];
    });
    if (!threads.length) throw new Error("no 'Who is hiring?' threads found");
    const now = new Date();
    const thisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const done = threads.filter((t) => t.ts < thisMonth).sort((a, b) => b.ts - a.ts);
    const have = new Set((db.prepare("SELECT ts FROM observations WHERE series_id = ?").all(HN_HIRING_ID) as { ts: number }[]).map((r) => r.ts));
    // Last month again (late posts after the month turned), plus any month not stored yet, up to three years back.
    const todo = done.filter((t, i) => i === 0 || !have.has(t.ts)).slice(0, 36);
    const points = [];
    for (const t of todo) {
      const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${t.id}.json`, Item);
      points.push({ ts: t.ts, value: item.kids?.length ?? 0 });
    }
    return upsertSeries(db, HN_HIRING_ID, "hnhiring", points);
  },
};
