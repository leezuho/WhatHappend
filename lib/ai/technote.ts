import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { SERIES, TECH_JOBS } from "@/config/series";
import { CRYPTO_OUTLETS, TECH_OUTLETS } from "@/config/feeds";
import { TW_REVENUE } from "@/config/tech";
import { clusterStories } from "@/lib/data/news";
import { getTile } from "@/lib/data/series";
import { LONG_INCIDENT_DAYS, techStockRows } from "@/lib/data/tech";
import { fmtPeriod, fmtValue } from "@/lib/format";
import { DAY, HOUR, type Source } from "@/lib/sources/types";
import type { AiModel } from "@/lib/sources/openrouter";
import type { KevEntry } from "@/lib/sources/kev";
import type { ServiceStatus } from "@/lib/sources/cloudstatus";
import type { TwRevenue } from "@/lib/sources/twse";
import type { EolRow } from "@/lib/sources/eol";
import { callsLeft } from "./budget";
import { aiStatus } from "./config";
import { generateJson } from "./provider";
import { isoWeek } from "./macronote";
import { TECH_NOTE_KEY, type StoredTechNote } from "./technote-shared";

// The weekly technology note: once per ISO week the "brief" model reads the
// tech page's own data (the week's biggest stories, new AI models, newly
// exploited flaws, outages, chip and AI-hardware numbers, hiring, support
// deadlines) and writes a short bilingual note. Same budget rules as the
// macro note: one call a week, both languages in that call, and it never
// takes the calls the daily brief and the macro note still need today.

/** Brief-model calls that must be left today: this note, the macro note and the daily brief. */
const MIN_CALLS_LEFT = 3;
const RETRY_AFTER = 6 * HOUR;
const WEEK = 7 * DAY;
/** Need at least this many tech stories in the week, or the news sources are still filling up. */
const MIN_STORIES = 15;

const NoteText = z.object({
  headline: z.string(),
  bullets: z.array(z.object({ title: z.string(), body: z.string() })),
  watch: z.array(z.string()),
});
const Out = z.object({ en: NoteText, vi: NoteText });

const SYSTEM = `You write a weekly technology note for one reader's personal dashboard. The reader lives in Vietnam, works with software, follows the news, but is not a specialist in every field.

You get this week's data from the dashboard's technology page: the week's biggest stories (each with how many outlets carried it), AI models newly listed on OpenRouter with prices, flaws newly added to CISA's list of exploited vulnerabilities, cloud and developer services with open incidents, big tech and chip stocks, Taiwan's AI hardware makers' latest monthly revenue, hiring indicators, and support deadlines of common tools.

Write:
- headline: one sentence on what mattered most in technology this week.
- bullets: 4 to 6 themes, most important first (AI models and companies, chips and AI hardware demand, security, outages, markets, jobs, Vietnam when a story concerns it). Each has a short title and 2 or 3 sentences that name the companies and cite the numbers given.
- watch: 2 to 4 things to keep an eye on next week (a deadline, a pending decision, a story still unfolding), each saying why in a few words.
Use only what is given; never invent figures, dates, quotes or events. Stories are headlines only: report what they say happened, attributed ("reportedly", "according to") when the headline is. No investment advice.

Produce the same note twice: "en" in English and "vi" in natural Vietnamese (keep product and company names as they are; "trí tuệ nhân tạo" or "AI", "lỗ hổng", "chip"). Both cover the same points with the same numbers.`;

export function readTechNote(db: DatabaseSync): StoredTechNote | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(TECH_NOTE_KEY) as { value: string | null } | undefined;
  return row?.value ? (JSON.parse(row.value) as StoredTechNote) : null;
}

function saveTechNote(db: DatabaseSync, note: StoredTechNote, now: number): void {
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
    TECH_NOTE_KEY,
    JSON.stringify(note),
    now,
  );
}

const items = <T>(db: DatabaseSync, kind: string) =>
  (db.prepare("SELECT id, title, ts, data FROM items WHERE kind = ? ORDER BY rank").all(kind) as { id: string; title: string; ts: number | null; data: string | null }[]).map((r) => ({
    ...r,
    data: (r.data ? JSON.parse(r.data) : {}) as T,
  }));

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const pct = (v: number | null) => (v === null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

/** The week's tech stories, one per story (clustered in English), most widely carried first. */
function stories(db: DatabaseSync, now: number) {
  const marks = (xs: string[]) => xs.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, url, source, coalesce(title_en, title) AS title, image FROM articles
       WHERE published_at >= ? AND (source IN (${marks(TECH_OUTLETS)}) OR (topic = 'tech' AND source NOT IN (${marks(CRYPTO_OUTLETS)})))
       ORDER BY published_at DESC LIMIT 600`,
    )
    .all(now - WEEK, ...TECH_OUTLETS, ...CRYPTO_OUTLETS) as { id: string; url: string; source: string; title: string; image: string | null }[];
  const clustered = clusterStories(
    rows.map((r) => ({ ...r, alsoIn: [], related: [] })),
    "en",
  );
  return clustered
    .map((s) => ({ title: s.title, outlets: 1 + s.alsoIn.length, articles: 1 + s.related.length }))
    .sort((a, b) => b.articles - a.articles || b.outlets - a.outlets)
    .slice(0, 25);
}

/** The model's input (compact, English) and its hash. */
export function techInput(db: DatabaseSync, now: number) {
  const top = stories(db, now);
  const models = items<AiModel>(db, "ai_models")
    .filter((m) => m.data.created >= now - WEEK)
    .slice(0, 15)
    .map(({ data: m }) => `${m.provider} ${m.name}: $${m.priceIn ?? "?"} in / $${m.priceOut ?? "?"} out per M tokens${m.context ? `, ${Math.round(m.context / 1000)}K context` : ""}${m.open ? ", open weights" : ""}`);
  const kev = items<KevEntry>(db, "kev")
    .filter((k) => k.ts !== null && k.ts >= now - WEEK)
    .map((k) => `${day(k.ts!)} ${k.id} ${k.data.vendor} ${k.data.product}: ${k.title}${k.data.ransomware ? " (used by ransomware)" : ""}`);
  // Incidents open for months (AWS's Middle East regions) are not this week's news; the status panel sets them aside too.
  const outages = items<ServiceStatus>(db, "status").flatMap((s) => {
    const fresh = s.data.incidents.filter((i) => i.since === null || i.since >= now - LONG_INCIDENT_DAYS * DAY);
    return fresh.length ? [`${s.title}: ${fresh.map((i) => `${i.title} (${i.impact}${i.since ? `, since ${day(i.since)}` : ""})`).join("; ")}`] : [];
  });
  const stocks = techStockRows(db, now).map((r) => `${r.name}: today ${pct(r.ch1d)}, 30 days ${pct(r.ch1m)}, this year ${pct(r.chYtd)}`);
  const tw = items<TwRevenue>(db, "tw_revenue").map(({ data: r }) => {
    const c = TW_REVENUE.find((x) => x.code === r.code);
    return `${c?.name ?? r.code} (${c?.role.en ?? ""}) ${fmtPeriod(r.month, "m", "en", true)}: NT$${r.revenue.toFixed(0)}bn, y/y ${pct(r.yoy)}, year to date ${pct(r.ytdYoy)}`;
  });
  const jobs = TECH_JOBS.flatMap((k) => {
    const def = SERIES[k];
    const t = getTile(db, def, now);
    return t ? [`${def.name.en}: ${fmtValue(def, t.value, "en")} (${def.freq ? fmtPeriod(t.ts, def.freq, "en", true) : day(t.ts)})`] : [];
  });
  const eol = items<EolRow>(db, "eol").flatMap(({ data: r }) =>
    r.nextEol && r.nextEol.date - now < 120 * DAY ? [`${r.name} ${r.nextEol.cycle} reaches end of life on ${day(r.nextEol.date)}`] : [],
  );
  const input = {
    date: day(now),
    topStories: top.map((s) => `${s.title} [${s.articles} articles, ${s.outlets} outlets]`),
    newAiModels: models,
    newlyExploitedFlaws: kev,
    openIncidents: outages,
    techStocks: stocks,
    taiwanAiHardwareRevenue: tw,
    hiring: jobs,
    supportDeadlines: eol,
  };
  const hash = createHash("sha1")
    .update(JSON.stringify([top.slice(0, 10).map((s) => s.title), models, kev]))
    .digest("hex")
    .slice(0, 16);
  return { input, hash, stories: top.length };
}

export const technote: Source = {
  id: "technote",
  ...SOURCE_META.technote,
  isDue(now, status, db) {
    if (status && !status.ok && now - status.last_run < RETRY_AFTER) return false;
    const note = readTechNote(db);
    if (note && note.checkedWeek === isoWeek(now)) return false;
    const ai = aiStatus();
    return ai.ok && callsLeft(db, ai.config, "brief", now) >= MIN_CALLS_LEFT;
  },
  async run({ db, log }) {
    const now = Date.now();
    const week = isoWeek(now);
    const prev = readTechNote(db);
    const { input, hash, stories: n } = techInput(db, now);
    if (n < MIN_STORIES) throw new Error(`only ${n} tech stories this week; waiting for the news sources`);
    if (prev && prev.hash === hash) {
      saveTechNote(db, { ...prev, checkedWeek: week }, now);
      log(`nothing new since ${prev.week}; kept that note`);
      return 0;
    }
    const user = JSON.stringify(input);
    const res = await generateJson({ tier: "brief", system: SYSTEM, user, schema: Out, maxTokens: 8192, db });
    if (!res.data) throw new Error(`tech note not produced by ${res.model} (stop_reason=${res.stopReason})`);
    saveTechNote(db, { week, checkedWeek: week, createdAt: now, model: res.model, hash, en: res.data.en, vi: res.data.vi }, now);
    log(`note for ${week} by ${res.model} (${user.length} chars in; ${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)`);
    return 1;
  },
};
