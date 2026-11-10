import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { SERIES, WORLD_PULSE, type SeriesKey } from "@/config/series";
import { RECESSION_SIGNALS, SCORE_COLS, type ScoreCol } from "@/config/macro";
import { BANKS, CB_MEETINGS } from "@/config/central-banks";
import { FOMC_MEETINGS } from "@/config/fomc";
import { MACRO_COUNTRIES } from "@/config/countries";
import { cycleRows, scorecardRows, type ScoreCell } from "@/lib/data/macro";
import { getTile } from "@/lib/data/series";
import { fmtPeriod, fmtValue } from "@/lib/format";
import { alertOf } from "@/lib/signals/notable";
import { DAY, HOUR, type Source } from "@/lib/sources/types";
import { callsLeft } from "./budget";
import { aiStatus } from "./config";
import { generateJson } from "./provider";
import { MACRO_NOTE_KEY, type SnapCell, type StoredMacroNote } from "./macronote-shared";

// The weekly macro note (Phase 3 of the macro page): once per ISO week the
// "brief" model reads the macro page's own numbers and writes a short bilingual
// note. Built for a free-tier key: one call a week, both languages in that call,
// a compact text snapshot (about 2k tokens in), only the changes since last
// week's note instead of a second snapshot, no call at all when no monthly,
// quarterly or yearly number moved, and it never takes the last calls of the
// day from the daily brief.

const TZ = "Asia/Ho_Chi_Minh";
/** Brief-model calls that must be left today: this note, plus one for the daily brief. */
const MIN_CALLS_LEFT = 2;
/** After a failure, wait this long (a quota error usually means the day is spent anyway). */
const RETRY_AFTER = 6 * HOUR;
const UPCOMING_DAYS = 8;
/** Need at least this many economies with a CPI reading, or the database is still filling up. */
const MIN_ECONOMIES = 8;

/** Cells compared week to week: slow ones always, daily markets only on a sizeable move. */
const SLOW: ScoreCol[] = ["gdp", "cpi", "unemp", "policy", "cli", "debt", "ca"];
const MOVE: Partial<Record<ScoreCol, number>> = { y10: 0.25, fx: 2 };

const NoteText = z.object({
  headline: z.string(),
  bullets: z.array(z.object({ title: z.string(), body: z.string() })),
  watch: z.array(z.string()),
});
const Out = z.object({ en: NoteText, vi: NoteText });

const SYSTEM = `You write a weekly world-economy note for one reader's personal dashboard. The reader lives in Vietnam, follows the news, but has no finance training.

You get this week's numbers from the dashboard's macro page: world indicators, a scorecard of economies (Vietnam last), each economy's business-cycle phase from the OECD leading indicator, US recession signals, what changed since last week's note, and the next week's central-bank decisions and major data releases.
Scorecard keys: gdp = real GDP vs a year earlier, latest quarter; cpi = consumer inflation vs a year earlier, latest month (cpiTarget = the central bank's target); unemp = unemployment rate; policy = central-bank rate; real = policy rate minus inflation (positive = money is tight); y10 = 10-year government bond yield; fxYtd = currency vs the US dollar since 31 Dec, % (positive = stronger; for the US, the dollar index); cli = OECD leading indicator (100 = trend growth) and its 3-month direction; debt = government debt, % of GDP; ca = current account, % of GDP. The period of each reading follows its number; "IMF est" marks an IMF yearly estimate standing in for missing monthly or quarterly data. [warn] and [crit] are the dashboard's watch and alarm levels; [good] = inflation near its target.

Write:
- headline: one sentence on the state of the world economy this week.
- bullets: 4 to 6 themes, most important first (growth and the cycle, inflation and rates, jobs, currencies and debt, recession risk, Vietnam). Each has a short title and 2 or 3 sentences that name the economies and cite the numbers given. Exactly one bullet is about Vietnam compared with its peers.
- watch: 2 to 4 items from the upcoming list worth watching, each saying why in a few words.
Use only the numbers given; never invent figures, dates or events. When a reading is old, say so. Explain any technical term in a few words. No investment advice and no predictions beyond the IMF estimates given.

Produce the same note twice: "en" in English and "vi" in natural Vietnamese (standard Vietnamese names, e.g. Mỹ, Trung Quốc, khu vực euro; "lạm phát", "lãi suất", "lợi suất"). Both cover the same points with the same numbers.`;

/** ISO week of a moment in Vietnam time, e.g. "2026-W46". */
export function isoWeek(now: number): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function readMacroNote(db: DatabaseSync): StoredMacroNote | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(MACRO_NOTE_KEY) as { value: string | null } | undefined;
  return row?.value ? (JSON.parse(row.value) as StoredMacroNote) : null;
}

function saveMacroNote(db: DatabaseSync, note: StoredMacroNote, now: number): void {
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
    MACRO_NOTE_KEY,
    JSON.stringify(note),
    now,
  );
}

const DIGITS = Object.fromEntries(SCORE_COLS.map((c) => [c.key, c.digits])) as Record<ScoreCol, number>;

/** A scorecard cell as compact English text: "3.7 Sep '26 [warn]", "2.1 IMF est 2026", "100.3 Sep '26 rising". */
export function cellText(col: ScoreCol, c: ScoreCell): SnapCell {
  if (c.value === null) return { s: "n/a", v: null };
  let s = c.value.toFixed(DIGITS[col]);
  if (c.dxy) s += " (DXY)";
  if (c.ts !== null && c.freq) s += ` ${c.est ? "IMF est " : ""}${fmtPeriod(c.ts, c.freq, "en", true)}`;
  if (c.trend) s += c.trend === "up" ? " rising" : " falling";
  if (c.status) s += ` [${c.status}]`;
  return { s, v: c.value };
}

/** "United States cpi: 3.4 Aug '26 → 3.7 Sep '26 [warn]" for every cell that moved since the last note. */
export function changesSince(prev: StoredMacroNote["snapshot"] | undefined, cur: StoredMacroNote["snapshot"]): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const [economy, cells] of Object.entries(cur)) {
    const before = prev[economy];
    if (!before) continue;
    for (const [col, now] of Object.entries(cells) as [ScoreCol, SnapCell][]) {
      const was = before[col];
      if (!was || was.s === now.s) continue;
      const min = MOVE[col];
      if (min !== undefined && (was.v === null || now.v === null || Math.abs(now.v - was.v) < min)) continue;
      if (min === undefined && !SLOW.includes(col)) continue;
      out.push(`${economy} ${col}: ${was.s} → ${now.s}`);
    }
  }
  return out.slice(0, 40);
}

function tileLine(db: DatabaseSync, key: SeriesKey, now: number) {
  const def = SERIES[key];
  const t = getTile(db, def, now);
  if (!t) return null;
  return {
    name: def.name.en,
    value: fmtValue(def, t.value, "en"),
    asOf: def.freq ? fmtPeriod(t.ts, def.freq, "en", true) : new Date(t.ts).toISOString().slice(0, 10),
    level: alertOf(def, t.value) ?? undefined,
  };
}

function upcoming(db: DatabaseSync, now: number): string[] {
  const from = new Date(now).toISOString().slice(0, 10);
  const to = new Date(now + UPCOMING_DAYS * DAY).toISOString().slice(0, 10);
  const inWindow = (iso: string) => iso >= from && iso <= to;
  const banks = [
    ...FOMC_MEETINGS.filter((m) => inWindow(m.end)).map((m) => `${m.end}: Federal Reserve rate decision${m.sep ? " (with projections)" : ""}`),
    ...CB_MEETINGS.filter((m) => inWindow(m.end)).map((m) => `${m.end}: ${BANKS[m.bank].name.en} rate decision`),
  ];
  const releases = (
    db
      .prepare("SELECT title, ts, data FROM items WHERE kind = 'calendar' AND ts BETWEEN ? AND ? ORDER BY ts LIMIT 40")
      .all(now, now + UPCOMING_DAYS * DAY) as { title: string; ts: number; data: string | null }[]
  ).flatMap((r) => {
    const d = r.data ? (JSON.parse(r.data) as { country?: string; impact?: string }) : {};
    return d.impact === "High" ? [`${new Date(r.ts).toISOString().slice(0, 10)}: ${d.country ?? ""} ${r.title}`.trim()] : [];
  });
  return [...banks, ...releases].sort().slice(0, 15);
}

/** The model's input (compact text, English) and the snapshot kept for next week. */
export function macroInput(db: DatabaseSync, now: number, prev?: StoredMacroNote) {
  const phases = new Map(cycleRows(db, "en", now).map((r) => [r.short, r.phase]));
  const rows = scorecardRows(db, "en", now);
  const snapshot: StoredMacroNote["snapshot"] = {};
  const economies = rows.map((r) => {
    const cells = Object.fromEntries(SCORE_COLS.map((col) => [col.key, cellText(col.key, r.cells[col.key])])) as Record<ScoreCol, SnapCell>;
    snapshot[r.name] = cells;
    const country = MACRO_COUNTRIES.find((c) => c.short === r.short);
    return {
      economy: r.name,
      group: r.group === "dm" ? "advanced" : "emerging",
      phase: phases.get(r.short) ?? "n/a",
      cpiTarget: country?.cpiTarget,
      ...Object.fromEntries(Object.entries(cells).map(([k, c]) => [k === "fx" ? "fxYtd" : k, c.s])),
    };
  });
  const hash = createHash("sha1")
    .update(JSON.stringify([rows.map((r) => SLOW.map((col) => cellText(col, r.cells[col]).s)), [...phases]]))
    .digest("hex")
    .slice(0, 16);
  const input = {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now),
    world: WORLD_PULSE.flatMap((k) => tileLine(db, k, now) ?? []),
    economies,
    usRecessionSignals: RECESSION_SIGNALS.flatMap((k) => tileLine(db, k, now) ?? []),
    changesSinceLastNote: prev ? changesSince(prev.snapshot, snapshot) : "no earlier note",
    upcoming: upcoming(db, now),
  };
  const withCpi = rows.filter((r) => r.cells.cpi.value !== null && !r.cells.cpi.est).length;
  return { input, snapshot, hash, withCpi };
}

export const macronote: Source = {
  id: "macronote",
  ...SOURCE_META.macronote,
  isDue(now, status, db) {
    if (status && !status.ok && now - status.last_run < RETRY_AFTER) return false;
    const note = readMacroNote(db);
    if (note && note.checkedWeek === isoWeek(now)) return false;
    const ai = aiStatus();
    return ai.ok && callsLeft(db, ai.config, "brief", now) >= MIN_CALLS_LEFT;
  },
  async run({ db, log }) {
    const now = Date.now();
    const week = isoWeek(now);
    const prev = readMacroNote(db) ?? undefined;
    const { input, snapshot, hash, withCpi } = macroInput(db, now, prev);
    if (withCpi < MIN_ECONOMIES) throw new Error(`only ${withCpi} economies have a monthly CPI yet; waiting for the macro sources`);
    if (prev && prev.hash === hash) {
      saveMacroNote(db, { ...prev, checkedWeek: week }, now);
      log(`no new monthly, quarterly or yearly numbers since ${prev.week}; kept that note`);
      return 0;
    }
    const user = JSON.stringify(input);
    const res = await generateJson({ tier: "brief", system: SYSTEM, user, schema: Out, maxTokens: 8192, db });
    if (!res.data) throw new Error(`macro note not produced by ${res.model} (stop_reason=${res.stopReason})`);
    saveMacroNote(db, { week, checkedWeek: week, createdAt: now, model: res.model, hash, snapshot, en: res.data.en, vi: res.data.vi }, now);
    log(`note for ${week} by ${res.model} (${user.length} chars in; ${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)`);
    return 1;
  },
};
