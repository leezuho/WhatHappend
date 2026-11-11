import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { SOURCE_META } from "@/config/sources";
import { SERIES, VITAL_SIGNS } from "@/config/series";
import { CRYPTO_OUTLETS, DESK_OUTLETS, TECH_OUTLETS } from "@/config/feeds";
import { getTile } from "@/lib/data/series";
import { fmtDelta } from "@/lib/format";
import { calendarForBrief } from "@/lib/data/calendar";
import { biggestMoves, type MoveRow } from "@/lib/data/markets";
import { regimeFromDb } from "@/lib/data/regime";
import type { RegimeResult } from "@/lib/signals/risk-regime";
import type { Source } from "@/lib/sources/types";
import { callsLeft } from "./budget";
import { aiStatus } from "./config";
import { generateJson } from "./provider";
import { FORCE_KEY, type StoredBrief } from "./brief-shared";

// The daily brief: once a day after 06:00 Vietnam time (or on demand from the
// UI), the "brief" model reads the last 24h of deduplicated headlines, the market
// snapshot, the day's and week's biggest moves, the risk regime and the calendar
// for today and tomorrow, and writes a short bilingual summary that cites its
// headlines. Before 2026-11-11 it saw only headlines and the snapshot, so the
// brief of 2026-11-10 led with a shooting and missed US CPI that evening and
// Brent's 13% fall on the week.

const TZ = "Asia/Ho_Chi_Minh";
const BRIEF_HOUR = 6;
const MIN_HEADLINES = 15;
const MAX_HEADLINES = 90;
/** A "Regenerate" request waits until the previous brief is this old, however often it is pressed. */
const MIN_FORCE_GAP = 10 * 60_000;

const BriefLang = z.object({
  headline: z.string(),
  bullets: z.array(z.object({ title: z.string(), body: z.string(), refs: z.array(z.number()) })),
  watch: z.array(z.string()),
});
const BriefOut = z.object({ vi: BriefLang, en: BriefLang });

const SYSTEM = `You write the morning world brief for one reader's personal dashboard. The reader invests and follows macro and geopolitics, and wants to understand, in under two minutes, what happened in the last 24 hours, why it matters, and what is coming.

Work only from the inputs: the numbered headlines, the market snapshot (markets), the biggest moves of the latest session and of the past week (moves), the dashboard's risk regime (regime), the economic calendar (calendar) and recent disasters. Do not add facts, numbers or events that are not in them; if something is unclear from a headline, say less rather than guess. Do not add titles, roles or descriptors for people or organisations (e.g. "former", "acting") unless the headline states them.

Rank by consequence, not by noise: order stories by how much they matter for markets, the economy and geopolitics (energy and supply routes, central banks and inflation, trade and sanctions, wars) and for many people's lives, not by how many outlets covered them or how shocking they are. A crime, accident or celebrity story ranks below a large market move or a policy shift unless it has wider consequences.

Write:
- headline: one sentence capturing the day.
- bullets: the 5 to 7 most consequential stories, most important first. Merge headlines about the same story. Each has a short title and a 1–3 sentence body saying what happened and why it matters. refs lists the numbers of the headlines it is based on (empty when it rests only on market or calendar data).
  - Every item in bigMoves (a session move of 3% or more, or 5% or more over the week) must appear, with the numbers given: inside the related story when a headline states its cause, otherwise together in one markets bullet. Do not invent causes. The rest of moves is context.
  - When calendar.released has a number with a forecast, report actual against forecast where it fits.
  - When regime.state is "risk-off", regime.leaningTo is set, or regime.creditDivergence is present, say so in one clause.
- watch: 2 to 5 short items for the next day or two. First every calendar.upcoming event with impact "High", each with its Vietnam time as given (e.g. "US CPI, Wed 12 Nov 20:30"); then other items grounded in the inputs.
Mention a market move only if markets or moves show it. No investment advice.

Produce the same brief twice: "en" in English and "vi" in natural Vietnamese (standard Vietnamese names for countries, e.g. Mỹ, Trung Quốc, Nga; times as "20:30 thứ Tư 12/11"). Both versions cover the same stories with the same refs.`;

export function vnDate(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function vnHour(now: number): number {
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
export function recentHeadlines(db: DatabaseSync, now: number, limit = MAX_HEADLINES, outlets: "world" | "crypto" | "tech" = "world"): HeadlineRow[] {
  // Crypto and tech outlets publish dozens of items a day: the world list leaves them out, each desk is asked for separately.
  const names = outlets === "crypto" ? CRYPTO_OUTLETS : outlets === "tech" ? TECH_OUTLETS : DESK_OUTLETS;
  const marks = names.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT COALESCE(title_en, title) AS title, url, source, region, topic, MAX(published_at) AS published_at
       FROM articles WHERE published_at >= ? AND (topic IS NULL OR topic != 'sports')
         AND source ${outlets === "world" ? "NOT IN" : "IN"} (${marks})
       GROUP BY title_key ORDER BY published_at DESC LIMIT ?`,
    )
    .all(now - 24 * 3600_000, ...names, limit) as unknown as HeadlineRow[];
}

/** Moves the brief must cover: a session of 3% or more, or a week of 5% or more. The model skipped them when left to judge. */
export function bigMoves(m: { day: MoveRow[]; week: MoveRow[] }): MoveRow[] {
  const out = new Map<string, MoveRow>();
  for (const r of m.day) if (Math.abs(r.day ?? 0) >= 3) out.set(r.name, r);
  for (const r of m.week) if (Math.abs(r.week ?? 0) >= 5) out.set(r.name, r);
  return [...out.values()];
}

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The badge's state in a form the model can quote: state, since when, which way the latest session leans, the gauges. */
export function regimeForPrompt(r: RegimeResult) {
  if (r.regime === "unknown") return null;
  const d = r.divergence;
  return {
    state: r.regime,
    score: r.score === null ? null : r2(r.score),
    since: r.since === null ? null : `${r.sinceAtLeast ? "at least since" : "since"} ${isoDay(r.since)}`,
    leaningTo: r.pending,
    override: r.override ?? null,
    creditDivergence: d
      ? `US high-yield spread ${r2(d.hy)}% on ${isoDay(d.hyTs)}, up ${Math.round((d.hy - d.low) * 100)} bp from ${r2(d.low)}% on ${isoDay(d.lowTs)}, while the S&P 500 is still ${r2(d.spxGap)}% above its 200-day average`
      : null,
    gauges: r.components.map((c) => ({ name: c.key, value: r2(c.value), asOf: isoDay(c.ts), z: r2(c.z) })),
  };
}

function forcedAt(db: DatabaseSync): number {
  const row = db.prepare("SELECT updated_at FROM kv WHERE key = ?").get(FORCE_KEY) as { updated_at: number } | undefined;
  return row?.updated_at ?? 0;
}

/** Everything the brief model reads, with the headlines its refs point into. */
export function briefInput(db: DatabaseSync, now: number) {
  const headlines = recentHeadlines(db, now);
  // The change as the tiles print it: % for prices, bp or pp for yields and spreads (a yield "up 2.45%" misleads).
  const markets = VITAL_SIGNS.flatMap((k) => {
    const t = getTile(db, SERIES[k]);
    if (!t) return [];
    return [{ name: SERIES[k].name.en, value: Number(t.value.toFixed(SERIES[k].digits)), change: fmtDelta(SERIES[k], t, "en") }];
  });
  const events = db
    .prepare("SELECT title, type, level FROM events WHERE ts >= ? AND (level IN ('orange','red') OR (type = 'earthquake' AND severity >= 6)) ORDER BY ts DESC LIMIT 15")
    .all(now - 48 * 3600_000);
  const calendar = calendarForBrief(db, now);
  const moves = biggestMoves(db, now);
  const input = {
    date: vnDate(now),
    headlines: headlines.map((h, i) => ({ n: i + 1, source: h.source, region: h.region, topic: h.topic, title: h.title })),
    markets,
    moves,
    bigMoves: bigMoves(moves),
    regime: regimeForPrompt(regimeFromDb(db, now)),
    calendar: { upcoming: calendar.upcoming.map((e) => ({ when: e.when, country: e.country, event: e.event, impact: e.impact, forecast: e.forecast, previous: e.previous })), released: calendar.released },
    disasters: events,
  };
  return { input, headlines };
}

export const brief: Source = {
  id: "brief",
  ...SOURCE_META.brief,
  isDue(now, status, db) {
    if (status && !status.ok && now - status.last_run < 30 * 60_000) return false;
    // A spent daily quota only comes back at midnight Pacific: asking again before then wastes nothing but logs.
    const ai = aiStatus();
    if (ai.ok && callsLeft(db, ai.config, "brief", now) <= 0) return false;
    const latest = db.prepare("SELECT MAX(created_at) AS t FROM briefs").get() as { t: number | null };
    const last = latest.t ?? 0;
    const forced = forcedAt(db) > last && now - last >= MIN_FORCE_GAP;
    const missingToday = !db.prepare("SELECT 1 FROM briefs WHERE date = ?").get(vnDate(now)) && vnHour(now) >= BRIEF_HOUR;
    if (!forced && !missingToday) return false;
    const n = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE published_at >= ?").get(now - 24 * 3600_000) as { n: number };
    return n.n >= MIN_HEADLINES;
  },
  async run({ db, log }) {
    const now = Date.now();
    const { input, headlines } = briefInput(db, now);

    const res = await generateJson({ tier: "brief", system: SYSTEM, user: JSON.stringify(input), schema: BriefOut, db });
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
