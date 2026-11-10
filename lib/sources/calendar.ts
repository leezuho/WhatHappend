import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { CALENDAR_ACTUALS, type ActualDef } from "@/config/calendar";
import { getPoints } from "@/lib/data/series";
import { fetchJson } from "./http";
import { fetchFredPoints } from "./fred";
import { hashId, replaceItems, upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// This week's economic calendar (ForexFactory's public JSON). Only this week
// is published and there is no "actual" field: for the US releases in
// config/calendar.ts the result is read off FRED once the release time has
// passed. FOMC meetings come from config/fomc.ts and are merged in the UI, not
// stored here.

const Resp = z.array(
  z.object({
    title: z.string(),
    country: z.string(),
    date: z.string(),
    impact: z.string(),
    forecast: z.string().nullish(),
    previous: z.string().nullish(),
  }),
);

const MEDIUM_FOR = new Set(["USD", "CNY", "EUR"]);
const DAY = 24 * 3600_000;
/** Released events stay stored this long, so the calendar can show how they came out. */
const KEEP_RELEASED = 24 * 3600_000;

export interface CalendarData {
  country: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
  /** The released number, printed like the forecast ("0.4%", "187K"). */
  actual?: string;
  /** actual − forecast in the forecast's unit; null when the forecast does not parse. */
  surprise?: number | null;
  /** Whether a higher-than-forecast reading is good news (jobs, growth) or bad (inflation, unemployment). */
  polarity?: ActualDef["polarity"];
}

/**
 * Start of the period a release covers (FRED stamps): the month before the release for monthly data,
 * the quarter before for GDP, the week ending the Saturday before for jobless claims (FRED dates
 * weekly claims by the Saturday). A release delayed past its usual month finds no observation and
 * shows no actual rather than a wrong one.
 */
export function refPeriod(freq: ActualDef["freq"], releaseTs: number): number {
  const d = new Date(releaseTs);
  if (freq === "m") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  if (freq === "q") return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 - 3, 1);
  const back = (d.getUTCDay() + 1) % 7 || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
}

function shift(ts: number, freq: ActualDef["freq"], n: number): number {
  const d = new Date(ts);
  if (freq === "w") return ts + n * 7 * DAY;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n * (freq === "q" ? 3 : 1), 1);
}

/** The number a release reports for `ref`, from the series' stored points; null when FRED does not have that period yet. */
export function actualValue(def: ActualDef, points: Point[], ref: number): number | null {
  const at = new Map(points.map((p) => [p.ts, p.value]));
  const cur = at.get(ref);
  if (cur === undefined) return null;
  const yearBack = def.freq === "w" ? -52 : def.freq === "q" ? -4 : -12;
  const base = at.get(shift(ref, def.freq, def.calc === "yoy" ? yearBack : -1));
  let v: number;
  switch (def.calc) {
    case "level":
      v = cur;
      break;
    case "diff":
      if (base === undefined) return null;
      v = cur - base;
      break;
    default:
      if (base === undefined || base === 0) return null;
      v = (cur / base - 1) * 100;
  }
  return v * (def.scale ?? 1);
}

/** "0.4%", "-0.1%", "187K": ForexFactory's style, so the actual reads against the forecast. */
export function fmtActual(def: ActualDef, v: number): string {
  const r = Number(v.toFixed(def.digits));
  return `${(Object.is(r, -0) ? 0 : r).toFixed(def.digits)}${def.unit}`;
}

/** A ForexFactory figure as a number in its own unit ("0.3%" → 0.3, "194K" → 194); null when it is not a plain number. */
export function parseFigure(s: string | null | undefined, unit: ActualDef["unit"]): number | null {
  if (!s) return null;
  const m = /^\s*([-+]?\d+(?:\.\d+)?)\s*([%KMB]?)\s*$/.exec(s);
  if (!m || (m[2] || "") !== unit) return null;
  return Number(m[1]);
}

const findDef = (title: string, country: string) => (country === "USD" ? CALENDAR_ACTUALS.find((d) => d.title === title) : undefined);

/**
 * Fill in the actuals of released US events. Reads the FRED series already stored by the `fred`
 * source; a series without the release's period yet (or not pulled by `fred` at all) is fetched
 * once here and stored, so the tile pages also see the new number before the next `fred` run.
 */
export async function addActuals(
  db: DatabaseSync,
  rows: { title: string; country: string; ts: number; forecast?: string | null }[],
  now: number,
  log: (msg: string) => void,
): Promise<Map<number, Pick<CalendarData, "actual" | "surprise" | "polarity">>> {
  const out = new Map<number, Pick<CalendarData, "actual" | "surprise" | "polarity">>();
  const fetched = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const def = findDef(r.title, r.country);
    if (!def || r.ts > now) continue;
    const ref = refPeriod(def.freq, r.ts);
    const id = `fred:${def.code}`;
    let v = actualValue(def, getPoints(db, id), ref);
    if (v === null && !fetched.has(def.code)) {
      fetched.add(def.code);
      try {
        const since = new Date(ref - 400 * DAY).toISOString().slice(0, 10);
        upsertSeries(db, id, "fred", await fetchFredPoints(def.code, since));
        v = actualValue(def, getPoints(db, id), ref);
      } catch (err) {
        // The calendar itself is still good; the actual shows on a later run.
        log(`actual ${r.title}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (v === null) continue;
    const actual = fmtActual(def, v);
    const forecast = parseFigure(r.forecast, def.unit);
    const shown = parseFigure(actual, def.unit);
    out.set(i, {
      actual,
      surprise: forecast === null || shown === null ? null : Number((shown - forecast).toFixed(def.digits)),
      polarity: def.polarity,
    });
  }
  return out;
}

export const calendar: Source = {
  id: "calendar",
  ...SOURCE_META.calendar,
  async run({ db, log }) {
    const rows = await fetchJson("https://nfs.faireconomy.media/ff_calendar_thisweek.json", Resp);
    const now = Date.now();
    const keep = rows
      .map((r) => ({ ...r, ts: Date.parse(r.date) }))
      .filter((r) => Number.isFinite(r.ts) && r.ts >= now - KEEP_RELEASED)
      .filter((r) => r.impact === "High" || (r.impact === "Medium" && MEDIUM_FOR.has(r.country)))
      .sort((a, b) => a.ts - b.ts);
    const actuals = await addActuals(db, keep, now, log);
    return replaceItems(
      db,
      "calendar",
      keep.map((r, i) => {
        const data: CalendarData = { country: r.country, impact: r.impact, forecast: r.forecast || null, previous: r.previous || null, ...actuals.get(i) };
        return { id: hashId(r.title + r.date + r.country), title: r.title, ts: r.ts, data };
      }),
    );
  },
};
