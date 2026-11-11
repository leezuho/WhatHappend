import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { SURPRISE_DEFS, SURPRISE_SINCE, surpriseId, type SurpriseDef, type SurpriseKind } from "@/config/surprise";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import { MINUTE, type Source } from "./types";

// US releases against the consensus forecast, for the economic surprise indices
// (config/surprise.ts, lib/data/surprise.ts). ForexFactory's feed holds only
// this week, so the forecasts come from Nasdaq's economic calendar, keyless
// JSON with every release's actual and consensus back to 2023 at least.
// Two quirks, both checked on every run:
// - `?date=D` lists the releases of the day before D;
// - times are US Eastern standard time all year (UTC−5): "07:30" in summer is the 8:30 a.m. release.
// The first runs walk back to SURPRISE_SINCE, a few months per run, newest first.

const Row = z.object({
  gmt: z.string(),
  country: z.string(),
  eventName: z.string(),
  actual: z.string(),
  consensus: z.string(),
  previous: z.string(),
});
export type CalRow = z.infer<typeof Row>;
const Resp = z.object({
  data: z.object({ rows: z.array(Row).nullish() }).nullish(),
  status: z.object({ rCode: z.number() }),
});

const DAY = 86_400_000;
const BACKFILL_KEY = "surprise:backfill";
/** Event days re-read every run: actuals land the day of the release, and a late fix is caught. */
const RECENT_DAYS = 10;
/** Older days read per run until the history reaches SURPRISE_SINCE (each request takes ~5 s). */
const BACKFILL_DAYS = 120;
const CONCURRENCY = 3;
/** An indicator not seen this long once the history is complete: Nasdaq has likely renamed it. */
const MAX_SILENT_DAYS = 150;
/** A lone row of a pair is the month's when its "previous" is within this of the last stored month's print (revisions are small). */
const PAIR_PREV_TOLERANCE = 0.2;

const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const url = (day: string) => `https://api.nasdaq.com/api/calendar/economicevents?date=${iso(Date.parse(day) + DAY)}`;

export interface Figure {
  value: number;
  kind: SurpriseKind;
}

const MULT: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

/** "1,718K" → 1 718 000 (count), "-0.7%" → −0.7 (pct), "51.4" → 51.4 (index); null for "&nbsp;", " " and anything else. */
export function parseFigure(s: string): Figure | null {
  const m = /^([-+]?\d*\.?\d+)([KMBT%]?)$/.exec(s.replace(/&nbsp;|[\s,]/g, ""));
  if (!m) return null;
  const v = Number(m[1]);
  if (m[2] === "%") return { value: v, kind: "pct" };
  if (m[2]) return { value: v * MULT[m[2]], kind: "count" };
  return { value: v, kind: "index" };
}

/** Release time from the event day and Nasdaq's "08:30" (UTC−5 all year); noon for "All Day", "Tentative". */
export function releaseTs(day: string, gmt: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(gmt.trim());
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : [12, 0];
  return Date.parse(`${day}T00:00:00Z`) + (h + 5) * 3600_000 + min * 60_000;
}

export interface Release {
  key: string;
  ts: number;
  actual: number;
  cons: number;
}

/** The stored actual of the indicator's last release before `before`, for telling the rows of a pair apart. */
export type PriorActual = (key: string, before: number) => number | null;

/**
 * The configured releases of one event day: the row of the right kind with a consensus, and an actual once
 * it is out. Rows repeated word for word count once.
 * - A pair (CPI on the month and on the year, same name, same kind): the month's row is the one whose
 *   "previous" matches the last stored print; without a stored print to match, the one with the smaller consensus.
 * - Listed twice otherwise (two months' building permits released together after a shutdown): the newer month,
 *   the row whose actual is not the other's "previous".
 * Anything still ambiguous is left out, and noted.
 */
export function pickReleases(day: string, rows: CalRow[], prior: PriorActual = () => null, defs: SurpriseDef[] = SURPRISE_DEFS): { releases: Release[]; notes: string[] } {
  const us = rows.filter((r) => r.country === "United States");
  const releases: Release[] = [];
  const notes: string[] = [];
  for (const def of defs) {
    const name = def.name.toLowerCase();
    const seen = new Set<string>();
    const cands = us
      .filter((r) => r.eventName.trim().toLowerCase() === name)
      .filter((r) => {
        const k = [r.gmt, r.actual, r.consensus, r.previous].join("|");
        return !seen.has(k) && seen.add(k);
      })
      .map((r) => ({ r, cons: parseFigure(r.consensus) }))
      .filter((x): x is { r: CalRow; cons: Figure } => x.cons?.kind === def.kind);
    if (!cands.length) continue;
    let pick: (typeof cands)[number] | undefined;
    if (def.pair) {
      const last = prior(def.key, Date.parse(`${day}T00:00:00Z`));
      const follows = cands.filter((c) => {
        const prev = parseFigure(c.r.previous);
        return last !== null && prev?.kind === def.kind && Math.abs(prev.value - last) <= PAIR_PREV_TOLERANCE;
      });
      if (follows.length === 1) pick = follows[0];
      else if (cands.length === 2 && Math.abs(cands[0].cons.value) !== Math.abs(cands[1].cons.value)) {
        pick = Math.abs(cands[0].cons.value) < Math.abs(cands[1].cons.value) ? cands[0] : cands[1];
      } else notes.push(`${day} ${def.name}: ${cands.length} row(s) of the month/year pair, last stored print ${last ?? "none"}`);
    } else if (cands.length === 1) pick = cands[0];
    else {
      const heads = cands.filter((c) => !cands.some((o) => o !== c && o.r.previous.trim() === c.r.actual.trim()));
      if (heads.length === 1) pick = heads[0];
      else notes.push(`${day} ${def.name}: listed ${cands.length} times`);
    }
    if (!pick) continue;
    const actual = parseFigure(pick.r.actual);
    if (actual?.kind !== def.kind) continue; // not released yet
    releases.push({ key: def.key, ts: releaseTs(day, pick.r.gmt), actual: actual.value, cons: pick.cons.value });
  }
  return { releases, notes };
}

/**
 * Weekly jobless claims come out on Thursday (Wednesday in a holiday week). When most of the days that list them
 * are not Thursdays, the calendar's date offset has changed and every release would be filed a day off. A single
 * odd day is history, not a shift: after the 2025 shutdown the backlog came out at 03:10 on Tuesday 18 November.
 */
export function checkClaimsDays(days: Map<string, CalRow[]>): void {
  const withClaims = [...days].filter(([, rows]) => rows.some((r) => r.country === "United States" && r.eventName === "Initial Jobless Claims")).map(([day]) => day);
  const thursdays = withClaims.filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 4).length;
  if (withClaims.length && thursdays < withClaims.length / 2) {
    throw new Error(`Nasdaq calendar lists jobless claims on ${withClaims.slice(0, 4).join(", ")}, ${thursdays} of ${withClaims.length} on a Thursday: the ?date= offset has changed`);
  }
}

/** Weekdays from `from` back to `to` (inclusive, newest first), at most `max`. */
function weekdaysBack(from: number, to: number, max: number): string[] {
  const out: string[] = [];
  for (let t = from; t >= to && out.length < max; t -= DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(iso(t));
  }
  return out;
}

function getCursor(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(BACKFILL_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

const backfillDone = (db: DatabaseSync) => (getCursor(db) ?? "9999") <= SURPRISE_SINCE;

async function readDay(day: string): Promise<CalRow[]> {
  const r = await fetchJson(url(day), Resp, { timeoutMs: 30_000 });
  if (r.status.rCode !== 200) throw new Error(`Nasdaq calendar ${day}: rCode ${r.status.rCode}`);
  return r.data?.rows ?? [];
}

/** Read `days` a few at a time, in order; stops at the first failure and reports how far it got. */
async function readDays(days: string[]): Promise<{ got: Map<string, CalRow[]>; error?: unknown }> {
  const got = new Map<string, CalRow[]>();
  for (let k = 0; k < days.length; k += CONCURRENCY) {
    const chunk = days.slice(k, k + CONCURRENCY);
    const res = await Promise.allSettled(chunk.map(readDay));
    for (const [j, r] of res.entries()) {
      if (r.status === "rejected") return { got, error: r.reason };
      got.set(chunk[j], r.value);
    }
  }
  return { got };
}

export const surprise: Source = {
  id: "surprise",
  ...SOURCE_META.surprise,
  // While the history is being read, come back every 10 minutes rather than every interval.
  isDue(now, status, db) {
    if (!status) return true;
    const every = SOURCE_META.surprise.intervalMs;
    const wait = !status.ok ? Math.max(MINUTE, every / 4) : backfillDone(db) ? every : 10 * MINUTE;
    return now - status.last_run >= wait;
  },
  async run({ db, log }) {
    // Today in the US (Eastern standard time), then back.
    const today = Date.parse(`${iso(Date.now() - 5 * 3600_000)}T00:00:00Z`);
    const recent = weekdaysBack(today, today - RECENT_DAYS * DAY, RECENT_DAYS + 1);
    const cursor = getCursor(db);
    const older = backfillDone(db) ? [] : weekdaysBack(Date.parse(`${cursor ?? recent[recent.length - 1]}T00:00:00Z`) - DAY, Date.parse(`${SURPRISE_SINCE}T00:00:00Z`), BACKFILL_DAYS);

    let written = 0;
    const notes: string[] = [];
    const lastBefore = db.prepare("SELECT value FROM observations WHERE series_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1");
    const prior: PriorActual = (key, before) => (lastBefore.get(surpriseId(key, "actual"), before) as { value: number } | undefined)?.value ?? null;
    const store = (got: Map<string, CalRow[]>) => {
      checkClaimsDays(got);
      for (const [day, rows] of [...got].sort(([a], [b]) => a.localeCompare(b))) {
        const picked = pickReleases(day, rows, prior);
        notes.push(...picked.notes);
        for (const r of picked.releases) {
          written += upsertSeries(db, surpriseId(r.key, "actual"), "surprise", [{ ts: r.ts, value: r.actual }]);
          written += upsertSeries(db, surpriseId(r.key, "cons"), "surprise", [{ ts: r.ts, value: r.cons }]);
        }
      }
    };

    const fresh = await readDays(recent);
    if (fresh.error) throw fresh.error;
    store(fresh.got);
    const withActuals = [...fresh.got.values()].flat().filter((r) => r.country === "United States" && parseFigure(r.actual) && parseFigure(r.consensus));
    if (!withActuals.length) throw new Error(`Nasdaq calendar: no US release with an actual and a consensus since ${recent[recent.length - 1]}`);

    if (older.length) {
      const back = await readDays(older);
      store(back.got);
      // The history is complete down to the oldest day read without a gap; SURPRISE_SINCE once nothing is left before it.
      if (back.got.size) {
        const reached = older[back.got.size - 1];
        const left = weekdaysBack(Date.parse(`${reached}T00:00:00Z`) - DAY, Date.parse(`${SURPRISE_SINCE}T00:00:00Z`), 1);
        db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
          BACKFILL_KEY,
          left.length ? reached : SURPRISE_SINCE,
          Date.now(),
        );
        log(`history read back to ${reached}${left.length ? "" : " (complete)"}`);
      }
      if (back.error) throw back.error;
    }
    if (notes.length) log(`left out: ${notes.slice(0, 5).join("; ")}${notes.length > 5 ? ` (+${notes.length - 5})` : ""}`);

    if (backfillDone(db)) {
      const last = db.prepare("SELECT MAX(ts) AS ts FROM observations WHERE series_id = ?");
      const silent = SURPRISE_DEFS.filter((d) => {
        const ts = (last.get(surpriseId(d.key, "actual")) as { ts: number | null }).ts;
        return ts === null || today - ts > MAX_SILENT_DAYS * DAY;
      });
      if (silent.length) throw new Error(`no release in ${MAX_SILENT_DAYS} days for ${silent.map((d) => `"${d.name}"`).join(", ")}: renamed on Nasdaq's calendar?`);
    }
    return written;
  },
};
