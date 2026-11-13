import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { themeForPrompt, themeStates, type ThemeState } from "@/lib/data/themes";
import { HOUR, MINUTE, type Source } from "@/lib/sources/types";
import { BRIEF_RESERVE, callsLeft } from "./budget";
import { aiStatus, type AiConfig } from "./config";
import { generateJson } from "./provider";
import { vnDate, vnHour } from "./brief";
import { parseThemeNotes, THEME_NOTES_KEY, type StoredThemeNotes } from "./themes-shared";

// Two or three sentences per dominant theme (config/themes.ts, LLDD 05 §3d):
// once a day after 06:00 Vietnam time, plus a rewrite when a theme's status
// changes (at most every 6 hours). One call covers every theme, each written
// only from that theme's own numbers, odds and headlines.

const WRITE_HOUR = 6;
/** A status change rewrites the notes at most this often. */
const REWRITE_GAP = 6 * HOUR;
/** Between daily notes, statuses are compared this often. */
const CHECK_EVERY = 30 * MINUTE;
const RETRY_AFTER = HOUR;
/** Statuses needed before anything is written; fewer means the database is still filling up. */
const MIN_KNOWN = 2;

const Out = z.object({ themes: z.array(z.object({ id: z.string(), en: z.string(), vi: z.string() })) });

const SYSTEM = `You write short notes on the dominant market themes for one reader's personal dashboard. The reader lives in Vietnam, invests, and follows macro and geopolitics, but wants plain words.

For each theme you get: its status over about a month (heating, cooling or steady; heatMeans says what heating means for that theme; heat is the mean of its gauges' moves measured in their usual monthly move), the gauges (value, date, change, heat), facts, how the theme reaches Vietnam with Vietnam's readings, prediction-market odds, and its most covered headlines of the last two days.

The card prints every gauge, fact, Vietnam reading and odds right under your note, with its value and change, and the Vietnam channel sentence (vietnam.channel) word for word. Do not repeat those numbers or that sentence: the note is the story that links them.

For each theme write 2 or 3 sentences, under 60 words:
1. Where it stands: the status and the one or two moves behind it, in words ("oil has slid back from its peak", "the dollar is at a one-year high"), without their figures.
2. Why, only if a headline says so (attribute claims, e.g. "according to Reuters"); never suggest a cause the headlines do not give. A figure from a headline that the card does not print may be quoted.
3. What the Vietnam readings show now, when they show something, again in words (not how the channel works: the card already says that).
Use only that theme's data: never borrow numbers or headlines from another theme, never invent figures, dates or events. Say so when a gauge's date is old. Mention odds only as what markets expect, without the percentage. No investment advice and no forecasts.

Every note ends with a full sentence. Write "en" in English and "vi" in natural Vietnamese (standard names, e.g. Mỹ, Trung Quốc, Fed, NHNN; "lợi suất", "lạm phát", "tỷ giá"). Return every theme id exactly once.`;

/** Ends like a finished sentence: a full stop, question or exclamation mark, ellipsis, or one of them inside a closing quote or bracket. */
export function isWhole(text: string): boolean {
  return /[.!?…][”"’')\]]*$/.test(text.trim());
}

export function readThemeNotes(db: DatabaseSync): StoredThemeNotes | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(THEME_NOTES_KEY) as { value: string | null } | undefined;
  return parseThemeNotes(row?.value);
}

/** "energy:cooling,fed:heating,…": what the notes were written for. */
export function basisOf(states: Pick<ThemeState, "def" | "status">[]): string {
  return states.map((s) => `${s.def.id}:${s.status}`).join(",");
}

/**
 * The daily note may take the brief model down to its last call (kept for the daily brief); a rewrite during the
 * day only uses it while the reserve for the brief, the weekly notes and a retry is untouched, then the fast model.
 */
export function pickTier(db: DatabaseSync, config: AiConfig, now: number, daily: boolean): "brief" | "fast" | null {
  const brief = callsLeft(db, config, "brief", now);
  if (brief > BRIEF_RESERVE || (daily && brief >= 2)) return "brief";
  return callsLeft(db, config, "fast", now) >= 1 ? "fast" : null;
}

const isDaily = (note: StoredThemeNotes | null, now: number) => !note || note.date !== vnDate(now);

export function themesDue(note: StoredThemeNotes | null, lastRun: number | null, now: number): boolean {
  if (!note) return true;
  if (note.date !== vnDate(now)) return vnHour(now) >= WRITE_HOUR;
  return now - note.createdAt >= REWRITE_GAP && (lastRun === null || now - lastRun >= CHECK_EVERY);
}

export const themes: Source = {
  id: "themes",
  ...SOURCE_META.themes,
  isDue(now, status, db) {
    if (status && !status.ok && now - status.last_run < RETRY_AFTER) return false;
    const ai = aiStatus();
    if (!ai.ok) return false;
    const note = readThemeNotes(db);
    if (!themesDue(note, status?.last_run ?? null, now)) return false;
    return pickTier(db, ai.config, now, isDaily(note, now)) !== null;
  },
  async run({ db, log }) {
    const now = Date.now();
    const states = themeStates(db, now);
    const known = states.filter((s) => s.status !== "unknown").length;
    if (known < MIN_KNOWN) throw new Error(`only ${known} themes have enough data for a status; waiting for the market sources`);
    const basis = basisOf(states);
    const note = readThemeNotes(db);
    if (note && !isDaily(note, now) && note.basis === basis) {
      log(`statuses unchanged since the notes of ${new Date(note.createdAt).toISOString()}; kept them`);
      return 0;
    }
    const ai = aiStatus();
    if (!ai.ok) throw new Error(`AI not configured: ${ai.reason}`);
    const tier = pickTier(db, ai.config, now, isDaily(note, now));
    if (!tier) throw new Error("no AI calls left today");

    const user = JSON.stringify({ date: vnDate(now), themes: states.map((s) => themeForPrompt(s)) });
    const res = await generateJson({ tier, system: SYSTEM, user, schema: Out, maxTokens: 8192, db });
    if (!res.data) throw new Error(`theme notes not produced by ${res.model} (stop_reason=${res.stopReason})`);

    const ids = new Set(states.map((s) => s.def.id as string));
    const notes: StoredThemeNotes["notes"] = {};
    const cut: string[] = [];
    for (const t of res.data.themes) {
      if (!ids.has(t.id) || !t.en.trim() || !t.vi.trim()) continue;
      if (isWhole(t.en) && isWhole(t.vi)) notes[t.id] = { en: t.en.trim(), vi: t.vi.trim() };
      else {
        // A note that stops mid-sentence (seen from the fast model on 2026-11-13) keeps the theme's previous one.
        cut.push(t.id);
        if (note?.notes[t.id]) notes[t.id] = note.notes[t.id];
      }
    }
    if (cut.length) log(`cut-off notes for ${cut.join(", ")}; kept the previous ones`);
    const stored: StoredThemeNotes = { date: vnDate(now), createdAt: now, model: res.model, basis, notes };
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      THEME_NOTES_KEY,
      JSON.stringify(stored),
      now,
    );
    log(`${Object.keys(notes).length}/${states.length} theme notes by ${res.model} (${basis}; ${user.length} chars in; ${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)`);
    return Object.keys(notes).length;
  },
};
