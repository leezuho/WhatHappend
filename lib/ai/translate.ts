import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { SOURCE_META } from "@/config/sources";
import { tx } from "@/lib/db";
import type { Source } from "@/lib/sources/types";
import { generateJson } from "./provider";
import { REGIONS, TOPICS } from "./taxonomy";

// Ingest-time enrichment, run by the worker every few minutes:
//  1. articles: translate the title into the other language and tag region/topic;
//  2. short English texts shown on the map and in lists: translate to Vietnamese.
// Each text is processed once; results are stored next to the original.

const BATCH = 40;
const MAX_BATCHES_PER_RUN = 4;

/** Item kinds whose titles are worth translating (others are names or already short codes). */
const TRANSLATED_ITEM_KINDS = ["polymarket", "polymarket_crypto", "who"];

const ArticleOut = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title_en: z.string(),
      title_vi: z.string(),
      region: z.enum(REGIONS),
      topic: z.enum(TOPICS),
    }),
  ),
});

const TextOut = z.object({ items: z.array(z.object({ id: z.string(), vi: z.string() })) });

const ARTICLE_SYSTEM = `You enrich news headlines for a bilingual (Vietnamese/English) world-news dashboard.
For every input headline return:
- title_en: natural English headline (copy it if already English; translate faithfully otherwise).
- title_vi: natural Vietnamese headline (copy if already Vietnamese). Use standard Vietnamese spellings for countries and well-known people (e.g. "Mỹ", "Trung Quốc", "Nga"); keep names without a common Vietnamese form as-is.
- region: where the story mainly happens. "vietnam" for Vietnam; "global" only for genuinely multi-region stories.
- topic: the single best fit.
Translate meaning, not word by word. Never add facts that are not in the headline. Return every id exactly once.`;

const TEXT_SYSTEM = `Translate each short English text (event titles, market questions, notices) into natural Vietnamese for a dashboard.
Keep numbers, units, tickers, dates and proper names accurate. Keep it concise. Return every id exactly once.`;

interface ArticleIn {
  id: string;
  title: string;
  lang: string;
  source: string;
}

async function enrichArticles(db: DatabaseSync, log: (m: string) => void): Promise<number> {
  const select = db.prepare(
    `SELECT id, title, lang, source FROM articles
     WHERE title_vi IS NULL OR title_en IS NULL OR region IS NULL
     ORDER BY published_at DESC LIMIT ?`,
  );
  const update = db.prepare("UPDATE articles SET title_en = ?, title_vi = ?, region = ?, topic = ? WHERE id = ?");
  let done = 0;
  for (let b = 0; b < MAX_BATCHES_PER_RUN; b++) {
    const rows = select.all(BATCH) as unknown as ArticleIn[];
    if (!rows.length) break;
    const res = await generateJson({
      tier: "fast",
      system: ARTICLE_SYSTEM,
      user: JSON.stringify(rows.map((r) => ({ id: r.id, lang: r.lang, source: r.source, title: r.title }))),
      schema: ArticleOut,
    });
    if (!res.data) {
      log(`article batch not parsed (stop_reason=${res.stopReason}); marking originals to avoid a retry loop`);
      // Fall back to the original title so a stubborn batch does not block the queue.
      tx(db, () => rows.forEach((r) => update.run(r.title, r.title, "global", "other", r.id)));
      continue;
    }
    const byId = new Map(res.data.items.map((i) => [i.id, i]));
    let skipped = 0;
    tx(db, () => {
      for (const r of rows) {
        const o = byId.get(r.id);
        if (o) update.run(o.title_en, o.title_vi, o.region, o.topic, r.id);
        else {
          // Leaving either title NULL would re-select this row on every batch of every run.
          update.run(r.title, r.title, "global", "other", r.id);
          skipped++;
        }
      }
    });
    if (skipped) log(`${skipped}/${rows.length} headlines missing from the model output; kept the original title`);
    done += rows.length;
  }
  return done;
}

async function translateTexts(db: DatabaseSync, log: (m: string) => void): Promise<number> {
  const kinds = TRANSLATED_ITEM_KINDS.map(() => "?").join(",");
  const pending = [
    ...(db.prepare("SELECT 'e:' || id AS id, title FROM events WHERE title_vi IS NULL ORDER BY ts DESC LIMIT ?").all(BATCH) as unknown as { id: string; title: string }[]),
    ...(db
      .prepare(`SELECT 'i:' || kind || ':' || id AS id, title FROM items WHERE title_vi IS NULL AND kind IN (${kinds}) ORDER BY rank LIMIT ?`)
      .all(...TRANSLATED_ITEM_KINDS, BATCH) as unknown as { id: string; title: string }[]),
  ];
  if (!pending.length) return 0;

  const res = await generateJson({
    tier: "fast",
    system: TEXT_SYSTEM,
    user: JSON.stringify(pending.map((p) => ({ id: p.id, text: p.title }))),
    schema: TextOut,
  });
  if (!res.data) {
    log(`text batch not parsed (stop_reason=${res.stopReason})`);
    return 0;
  }
  const out = new Map(res.data.items.map((i) => [i.id, i.vi]));
  const setEvent = db.prepare("UPDATE events SET title_vi = ? WHERE id = ?");
  const setItem = db.prepare("UPDATE items SET title_vi = ? WHERE kind = ? AND id = ?");
  tx(db, () => {
    for (const p of pending) {
      // Unanswered ids keep the original so they are not re-sent forever.
      const vi = out.get(p.id) ?? p.title;
      if (p.id.startsWith("e:")) setEvent.run(vi, p.id.slice(2));
      else {
        const rest = p.id.slice(2);
        const sep = rest.indexOf(":");
        setItem.run(vi, rest.slice(0, sep), rest.slice(sep + 1));
      }
    }
  });
  return pending.length;
}

export const translate: Source = {
  id: "translate",
  ...SOURCE_META.translate,
  async run({ db, log }) {
    const a = await enrichArticles(db, log);
    const t = await translateTexts(db, log);
    return a + t;
  },
};
