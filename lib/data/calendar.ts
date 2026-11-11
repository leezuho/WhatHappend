import type { DatabaseSync } from "node:sqlite";
import { BANKS, CB_MEETINGS } from "@/config/central-banks";
import { US_RELEASES } from "@/config/calendar";
import { FOMC_MEETINGS } from "@/config/fomc";
import { ELECTIONS, electionTs } from "@/config/elections";
import type { CalendarData } from "@/lib/sources/calendar";
import { vnMarketDates } from "./vietnam";

// The calendar as the worker's AI prompts see it (no Next imports): what is due
// today and tomorrow in Vietnam, and which numbers came out in the last day and
// how they compared with the forecast. The web's calendar panel has its own
// reader in lib/queries.ts (getCalendar) with display strings.

const DAY = 86_400_000;
const TZ = "Asia/Ho_Chi_Minh";

export interface BriefEvent {
  /** Vietnam time, e.g. "Thu 12 Nov 20:30"; date only for all-day entries. */
  when: string;
  ts: number;
  country: string;
  event: string;
  impact: "High" | "Medium";
  forecast?: string | null;
  previous?: string | null;
}

export interface BriefRelease {
  when: string;
  country: string;
  event: string;
  actual: string;
  forecast: string | null;
  /** actual − forecast in the forecast's unit. */
  surprise: number | null;
  /** Whether the surprise is good news (more jobs) or bad (more inflation); null without a forecast. */
  better: boolean | null;
}

function vnWhen(ts: number, allDay = false): string {
  const opts: Intl.DateTimeFormatOptions = allDay
    ? { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }
    : { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return new Intl.DateTimeFormat("en-GB", opts).format(ts).replace(",", "");
}

/** Midnight in Vietnam (UTC+7, no daylight saving) of the day `ts` falls on. */
function vnDayStart(ts: number): number {
  const shift = 7 * 3600_000;
  return Math.floor((ts + shift) / DAY) * DAY - shift;
}

/** UTC time of `hour`:00 New York time on `date` (YYYY-MM-DD), daylight saving included. */
export function nyTime(date: string, hour: number): number {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return guess + (guess - asIfUtc);
}

interface ItemRow {
  title: string;
  ts: number | null;
  data: string | null;
}

/**
 * High-impact events from now to the end of tomorrow (Vietnam time): ForexFactory's high-impact releases,
 * FRED's scheduled US releases past ForexFactory's week, FOMC and other central-bank decisions, and the
 * Vietnam market dates (VN30 futures expiry, statistics release) and national elections (config/elections.ts). Plus every release of the last 24 hours
 * that has an actual.
 */
export function calendarForBrief(db: DatabaseSync, now: number): { upcoming: BriefEvent[]; released: BriefRelease[] } {
  const until = vnDayStart(now) + 2 * DAY;
  const rows = (kind: string) => db.prepare("SELECT title, ts, data FROM items WHERE kind = ? AND ts IS NOT NULL ORDER BY ts").all(kind) as unknown as ItemRow[];
  const econ = rows("calendar").map((r) => ({ title: r.title, ts: r.ts!, d: JSON.parse(r.data ?? "{}") as CalendarData }));
  const ffEnd = econ.reduce((a, e) => Math.max(a, e.ts), 0);
  const ffEndDay = ffEnd ? Math.floor(ffEnd / DAY) * DAY + DAY : 0;
  const inWindow = (ts: number) => ts >= now && ts < until;

  const upcoming: BriefEvent[] = [
    ...econ
      .filter((e) => e.d.impact === "High" && !e.d.actual && inWindow(e.ts))
      .map((e) => ({ when: vnWhen(e.ts), ts: e.ts, country: e.d.country, event: e.title, impact: "High" as const, forecast: e.d.forecast, previous: e.d.previous })),
    ...rows("us_releases").flatMap((r) => {
      const def = US_RELEASES.find((x) => x.rid === (JSON.parse(r.data ?? "{}") as { rid?: number }).rid);
      return def && r.ts! >= ffEndDay && inWindow(r.ts!) ? [{ when: vnWhen(r.ts!), ts: r.ts!, country: "USD", event: def.name.en, impact: "High" as const }] : [];
    }),
    ...FOMC_MEETINGS.flatMap((m) => {
      const ts = nyTime(m.end, 14); // statement at 2 pm New York
      return inWindow(ts) ? [{ when: vnWhen(ts), ts, country: "USD", event: `FOMC rate decision${m.sep ? " with projections" : ""}`, impact: "High" as const }] : [];
    }),
    ...CB_MEETINGS.flatMap((m) => {
      const ts = Date.parse(`${m.end}T12:00:00Z`);
      return inWindow(ts) ? [{ when: vnWhen(ts, true), ts, country: BANKS[m.bank].country, event: `${BANKS[m.bank].name.en} rate decision`, impact: "High" as const }] : [];
    }),
    ...ELECTIONS.flatMap((e) => {
      const ts = electionTs(e);
      return inWindow(ts) ? [{ when: vnWhen(ts, true), ts, country: e.code, event: `${e.country.en} ${e.kind.en}${e.expected ? " (date not fixed)" : ""}`, impact: "High" as const }] : [];
    }),
    ...vnMarketDates(vnDayStart(now) - DAY, until).flatMap((v) => {
      const ts = v.ts + 10 * 3600_000; // 17:00 Hanoi, as the calendar panel stamps it
      if (!inWindow(ts)) return [];
      const event = v.kind === "vn30f" ? `VN30 futures expiry (${v.month + 1}/${v.year} contract)` : `Vietnam statistics office monthly data (${v.month + 1}/${v.year})`;
      return [{ when: vnWhen(v.ts, true), ts, country: "VND", event, impact: "Medium" as const }];
    }),
  ].sort((a, b) => a.ts - b.ts);

  const released: BriefRelease[] = econ
    .filter((e) => e.d.actual && e.ts <= now && e.ts >= now - DAY)
    .map((e) => ({
      when: vnWhen(e.ts),
      country: e.d.country,
      event: e.title,
      actual: e.d.actual!,
      forecast: e.d.forecast,
      surprise: e.d.surprise ?? null,
      better: e.d.surprise ? (e.d.surprise > 0) === (e.d.polarity === "up-good") : null,
    }));
  return { upcoming, released };
}
