import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { bigMoves, brief, regimeForPrompt, vnDate } from "@/lib/ai/brief";
import { calendarForBrief, nyTime } from "@/lib/data/calendar";
import { biggestMoves } from "@/lib/data/markets";
import { replaceItems, upsertQuotes, upsertSeries } from "@/lib/sources/store";
import type { RegimeResult } from "@/lib/signals/risk-regime";
import { FORCE_KEY } from "@/lib/ai/brief-shared";
import { needsNote } from "@/lib/ai/insights";

const H = 3600_000;
const MIN = 60_000;

test("needsNote: rewrite on a new reason or old age, not when a reason lapses", () => {
  const now = Date.now();
  const note = (basis: string, ageMs = H) => ({ basis, created_at: now - ageMs });
  const warn = { kind: "warn" as const, since: now, fresh: true };
  const crit = { kind: "crit" as const, since: now, fresh: true };
  assert.equal(needsNote([warn], undefined, now), true, "no note yet");
  assert.equal(needsNote([warn, { kind: "move", z: 2.3 }], note("move+warn"), now), false, "same reasons");
  assert.equal(needsNote([warn], note("move+warn"), now), false, "move faded");
  assert.equal(needsNote([warn, { kind: "move", z: -2.1 }], note("move+warn"), now), false, "move came back");
  assert.equal(needsNote([crit], note("warn"), now), true, "escalated to crit");
  assert.equal(needsNote([warn], note("crit"), now), false, "eased to warn");
  assert.equal(needsNote([{ kind: "high" }], note("warn"), now), true, "new 1-year high");
  assert.equal(needsNote([warn], note("warn", 13 * H), now), true, "older than 12 hours");
  assert.equal(needsNote([warn, { kind: "week", z: -2.6, change: -13 }], note("warn"), now), true, "a large move over the week");
});

function briefDb(now: number, { briefAgeMs, articles }: { briefAgeMs: number; articles: number }) {
  const db = openDb(":memory:");
  const ins = db.prepare(
    "INSERT INTO articles (id, url, source, lang, title, title_key, published_at, fetched_at) VALUES (?, ?, 'BBC', 'en', ?, ?, ?, ?)",
  );
  for (let i = 0; i < articles; i++) ins.run(`a${i}`, `https://x.example/${i}`, `Headline ${i}`, `headline ${i}`, now - i * MIN, now);
  for (const lang of ["en", "vi"]) {
    db.prepare("INSERT INTO briefs (date, lang, content, created_at) VALUES (?, ?, '{}', ?)").run(vnDate(now), lang, now - briefAgeMs);
  }
  return db;
}

const force = (db: ReturnType<typeof openDb>, at: number) =>
  db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, '1', ?)").run(FORCE_KEY, at);

test("brief.isDue: today's brief exists and nothing was requested", () => {
  const now = Date.now();
  assert.equal(brief.isDue!(now, undefined, briefDb(now, { briefAgeMs: 2 * H, articles: 20 })), false);
});

test("brief.isDue: a Regenerate request waits until the last brief is 10 minutes old", () => {
  const now = Date.now();
  const db = briefDb(now, { briefAgeMs: 5 * MIN, articles: 20 });
  force(db, now);
  assert.equal(brief.isDue!(now, undefined, db), false, "5 minutes after the last brief");
  assert.equal(brief.isDue!(now + 6 * MIN, undefined, db), true, "11 minutes after the last brief");
});

test("brief.isDue: no rewrite after a recent failure or with too few headlines", () => {
  const now = Date.now();
  const db = briefDb(now, { briefAgeMs: 2 * H, articles: 20 });
  force(db, now);
  const failed = { source: "brief", ok: 0, error: "429", count: 0, last_run: now - 10 * MIN, last_ok: null };
  assert.equal(brief.isDue!(now, failed, db), false, "failed 10 minutes ago");
  assert.equal(brief.isDue!(now, undefined, db), true, "same request without the failure");

  const sparse = briefDb(now, { briefAgeMs: 2 * H, articles: 5 });
  force(sparse, now);
  assert.equal(brief.isDue!(now, undefined, sparse), false, "too few headlines");
});

// ---------------------------------------------------------------- brief inputs (2026-11-11)

test("nyTime: 2 pm New York in UTC, with and without daylight saving", () => {
  assert.equal(new Date(nyTime("2026-12-09", 14)).toISOString(), "2026-12-09T19:00:00.000Z", "EST");
  assert.equal(new Date(nyTime("2027-06-16", 14)).toISOString(), "2027-06-16T18:00:00.000Z", "EDT");
});

test("calendarForBrief: high-impact events to the end of tomorrow in Vietnam, and today's actuals", () => {
  const db = openDb(":memory:");
  // Tue 10 Nov 2026, 06:00 in Hanoi.
  const now = Date.UTC(2026, 10, 9, 23);
  const at = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m);
  replaceItems(db, "calendar", [
    { id: "cpi", title: "CPI y/y", ts: at(10, 13, 30), data: { country: "USD", impact: "High", forecast: "3.0%", previous: "2.9%" } },
    { id: "claims", title: "Unemployment Claims", ts: at(12, 13, 30), data: { country: "USD", impact: "Medium", forecast: "194K", previous: "189K" } },
    { id: "gdp", title: "GDP m/m", ts: at(11, 7), data: { country: "GBP", impact: "High", forecast: "0.0%", previous: "0.1%" } },
    { id: "later", title: "PPI m/m", ts: at(11, 17, 30), data: { country: "USD", impact: "High", forecast: "0.4%", previous: "1.3%" } },
    { id: "nfp", title: "Non-Farm Employment Change", ts: at(9, 13, 30), data: { country: "USD", impact: "High", forecast: "150K", previous: "120K", actual: "187K", surprise: 37, polarity: "up-good" } },
  ]);
  const { upcoming, released } = calendarForBrief(db, now);
  assert.deepEqual(
    upcoming.map((e) => [e.when, e.country, e.event]),
    [
      ["Tue 10 Nov 20:30", "USD", "CPI y/y"],
      ["Wed 11 Nov 14:00", "GBP", "GDP m/m"],
    ],
    "medium impact and anything after Wednesday midnight in Hanoi are left out",
  );
  assert.deepEqual(released, [{ when: "Mon 9 Nov 20:30", country: "USD", event: "Non-Farm Employment Change", actual: "187K", forecast: "150K", surprise: 37, better: true }]);
});

test("calendarForBrief: the FOMC decision at its Hanoi time, other central banks by date", () => {
  const db = openDb(":memory:");
  const { upcoming } = calendarForBrief(db, Date.UTC(2026, 11, 9, 1));
  assert.deepEqual(
    upcoming.map((e) => [e.when, e.event]),
    [
      ["Wed 9 Dec", "Bank of Canada rate decision"],
      ["Wed 9 Dec", "Brazil central bank (Copom) rate decision"],
      ["Thu 10 Dec 02:00", "FOMC rate decision with projections"],
    ],
  );
});

test("biggestMoves: largest absolute % moves of the session and the week", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 10, 12);
  const DAYMS = 86_400_000;
  const flat = (v: number) => Array.from({ length: 20 }, (_, i) => ({ ts: Date.UTC(2026, 10, 10) - (19 - i) * DAYMS, value: v }));
  upsertSeries(db, "yahoo:BZ=F", "yahoo", flat(106));
  upsertSeries(db, "yahoo:^GSPC", "yahoo", flat(7000));
  upsertQuotes(db, [
    { seriesId: "yahoo:BZ=F", price: 92.2, change: 1, changePct: 1.1, marketState: "REGULAR", ts: now },
    { seriesId: "yahoo:^GSPC", price: 7161, change: 161, changePct: 2.3, marketState: "REGULAR", ts: now },
  ]);
  const m = biggestMoves(db, now, 2);
  assert.deepEqual(m.day.map((r) => [r.name, r.day]), [
    ["S&P 500 (US)", 2.3],
    ["Brent crude", 1.1],
  ]);
  assert.deepEqual(m.week.map((r) => [r.name, r.week]), [
    ["Brent crude", -13],
    ["S&P 500 (US)", 2.3],
  ]);
});

test("regimeForPrompt: state, since, lean and the credit divergence in words", () => {
  const base: RegimeResult = { regime: "unknown", score: null, components: [], since: null, sinceAtLeast: false, pending: null, divergence: null };
  assert.equal(regimeForPrompt(base), null);
  const r = regimeForPrompt({
    ...base,
    regime: "neutral",
    score: -0.183,
    since: Date.UTC(2026, 9, 21),
    sinceAtLeast: true,
    pending: "risk-off",
    components: [{ key: "vix", value: 19.46, ts: Date.UTC(2026, 10, 10), z: 0.114, weight: 1, years: 10 }],
    divergence: { hy: 3.34, hyTs: Date.UTC(2026, 10, 9), low: 2.6, lowTs: Date.UTC(2026, 7, 28), spxGap: 2.589 },
  })!;
  assert.equal(r.since, "at least since 2026-10-21");
  assert.equal(r.leaningTo, "risk-off");
  assert.equal(r.score, -0.18);
  assert.match(r.creditDivergence!, /3\.34% on 2026-11-09, up 74 bp from 2\.6% on 2026-08-28/);
  assert.deepEqual(r.gauges, [{ name: "vix", value: 19.46, asOf: "2026-11-10", z: 0.11 }]);
});

test("bigMoves: 3% in a session or 5% in a week, each instrument once", () => {
  const row = (name: string, day: number, week: number) => ({ name, day, week, ytd: null });
  const m = {
    day: [row("KOSPI", 3.2, -6.5), row("Silver", 2.3, 0.5)],
    week: [row("US gas", 0.3, 11.8), row("KOSPI", 3.2, -6.5), row("Nifty", 0.2, 4.5)],
  };
  assert.deepEqual(
    bigMoves(m).map((r) => r.name),
    ["KOSPI", "US gas"],
  );
});
