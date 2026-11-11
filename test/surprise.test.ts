import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { upsertSeries } from "@/lib/sources/store";
import { checkClaimsDays, parseFigure, pickReleases, releaseTs, type CalRow } from "@/lib/sources/surprise";
import { releaseWeight, scoreReleases, surpriseIndex, surpriseView, typicalSurprise } from "@/lib/data/surprise";
import { SURPRISE_DEFS, SURPRISE_MIN_RELEASES, surpriseId, type SurpriseDef } from "@/config/surprise";

const DAY = 86_400_000;
const def = (key: string): SurpriseDef => SURPRISE_DEFS.find((d) => d.key === key)!;
const row = (eventName: string, actual: string, consensus: string, previous = " ", gmt = "08:30", country = "United States"): CalRow => ({
  gmt,
  country,
  eventName,
  actual,
  consensus,
  previous,
});

test("parseFigure: Nasdaq's figures as numbers in base units, by kind", () => {
  assert.deepEqual(parseFigure("1,718K"), { value: 1_718_000, kind: "count" });
  assert.deepEqual(parseFigure("-105.00B"), { value: -105e9, kind: "count" });
  assert.deepEqual(parseFigure("1.221M"), { value: 1_221_000, kind: "count" });
  assert.deepEqual(parseFigure("-0.7%"), { value: -0.7, kind: "pct" });
  assert.deepEqual(parseFigure("51.4"), { value: 51.4, kind: "index" });
  assert.deepEqual(parseFigure("-2"), { value: -2, kind: "index" });
  assert.equal(parseFigure("&nbsp;"), null);
  assert.equal(parseFigure(" "), null);
  assert.equal(parseFigure("n/a"), null);
});

test("releaseTs: Nasdaq's times are UTC−5 all year; noon when there is no time", () => {
  assert.equal(releaseTs("2026-11-06", "08:30"), Date.UTC(2026, 10, 6, 13, 30));
  // The summer 8:30 a.m. release, listed as 07:30.
  assert.equal(releaseTs("2023-10-06", "07:30"), Date.UTC(2023, 9, 6, 12, 30));
  assert.equal(releaseTs("2026-12-25", "All Day"), Date.UTC(2026, 11, 25, 17, 0));
});

test("pickReleases: the right row of each configured release, US only, once released", () => {
  const { releases, notes } = pickReleases("2026-11-06", [
    row("Nonfarm Payrolls", "165K", "65K", "60K"),
    row("Nonfarm Payrolls", "165K", "65K", "60K"), // listed twice word for word
    row("Nonfarm Payrolls", "20K", "15K", "10K", "08:30", "Canada"),
    // Housing starts as a level and as a % change: the configured kind is the level.
    row("Housing Starts", "-5.2%", "1.9%", "-5.9%"),
    row("Housing Starts", "1.221M", "1.300M", "1.288M"),
    row("Unemployment Rate", "&nbsp;", "4.2%"), // not out yet
    row("Retail Sales", "3.75%", " "), // no consensus
  ]);
  assert.deepEqual(notes, []);
  const at = Date.UTC(2026, 10, 6, 13, 30);
  assert.deepEqual(releases, [
    { key: "nfp", ts: at, actual: 165_000, cons: 65_000 },
    { key: "starts", ts: at, actual: 1_221_000, cons: 1_300_000 },
  ]);
});

test("pickReleases: CPI on the month, told from CPI on the year", () => {
  const both = [row("CPI", "3.7%", "3.6%", "3.4%"), row("CPI", "0.6%", "0.6%", "0.4%")];
  // No stored print yet: the smaller consensus.
  assert.deepEqual(pickReleases("2026-10-14", both).releases.map((r) => r.actual), [0.6]);
  // A stored print: the row whose "previous" follows it, even when its consensus is the larger
  // (import prices in April 2026: 0.8% on the month against a 2.3% forecast, 2.1% on the year against 2.0%).
  const odd = [row("CPI", "0.8%", "2.3%", "0.9%"), row("CPI", "2.1%", "2.0%", "1.3%")];
  assert.deepEqual(pickReleases("2026-04-15", odd, () => 0.9).releases.map((r) => r.actual), [0.8]);
  // Only one row listed (CPI on 10 Nov 2026): kept when its "previous" is the last stored print.
  const lone = [row("CPI", "0.4%", "0.3%", "0.6%")];
  assert.deepEqual(pickReleases("2026-11-10", lone, () => 0.6).releases.map((r) => r.actual), [0.4]);
  const unknown = pickReleases("2026-11-10", lone);
  assert.deepEqual(unknown.releases, []);
  assert.match(unknown.notes[0], /CPI: 1 row\(s\) of the month\/year pair/);
  assert.deepEqual(pickReleases("2026-11-10", [row("CPI", "3.1%", "3.0%", "3.4%")], () => 0.6).releases, []);
});

test("pickReleases: two months released together keep the newer; otherwise ambiguous rows are left out", () => {
  // Building permits on 5 May 2026, after the shutdown: March's revision, then April's first print.
  const permits = [row("Building Permits", "1.538M", "1.538M", "1.386M", "07:30"), row("Building Permits", "1.363M", "1.372M", "1.538M", "07:31")];
  assert.deepEqual(pickReleases("2026-05-05", permits).releases.map((r) => r.actual), [1_363_000]);
  const twice = pickReleases("2026-05-05", [row("Retail Sales", "0.5%", "0.3%", "0.1%"), row("Retail Sales", "0.7%", "0.2%", "0.4%")]);
  assert.deepEqual(twice.releases, []);
  assert.match(twice.notes[0], /Retail Sales: listed 2 times/);
});

test("checkClaimsDays: jobless claims mostly on Thursdays, else the date offset moved", () => {
  const claims = [row("Initial Jobless Claims", "189K", "197K")];
  const days = (...ds: string[]) => new Map(ds.map((d) => [d, claims]));
  checkClaimsDays(days("2026-11-05", "2026-10-29")); // Thursdays
  checkClaimsDays(days("2026-11-25", "2026-11-19")); // Wednesday before Thanksgiving, and a Thursday
  checkClaimsDays(days("2025-11-18", "2025-11-20", "2025-11-26", "2025-12-04")); // the post-shutdown backlog on a Tuesday
  checkClaimsDays(new Map([["2026-11-06", [row("Nonfarm Payrolls", "165K", "65K")]]]));
  assert.throws(() => checkClaimsDays(days("2026-11-06", "2026-10-30")), /0 of 2 on a Thursday: the \?date= offset has changed/);
  assert.throws(() => checkClaimsDays(days("2026-11-04")), /offset has changed/);
});

test("typicalSurprise: root mean square of the misses, once there are enough", () => {
  assert.equal(typicalSurprise(Array(SURPRISE_MIN_RELEASES - 1).fill(1)), null);
  assert.equal(typicalSurprise([3, -4, 3, -4, 3, -4, 3, -4]), Math.sqrt(12.5));
  assert.equal(typicalSurprise(Array(SURPRISE_MIN_RELEASES).fill(0)), null);
});

/** `n` monthly releases ending at `end`, missing the consensus by `miss(i)`. */
function monthly(n: number, end: number, miss: (i: number) => number, cons = 100) {
  const actual = [];
  const c = [];
  for (let i = 0; i < n; i++) {
    const ts = end - (n - 1 - i) * 30 * DAY;
    actual.push({ ts, value: cons + miss(i) });
    c.push({ ts, value: cons });
  }
  return { actual, cons: c };
}

test("scoreReleases and surpriseIndex: signed, clipped, weighted by age within three months", () => {
  const now = Date.UTC(2026, 10, 11);
  // Payrolls miss by ±10 for 11 months (typical miss 10 + a bit), then beat by 100: clipped at +3.
  const nfp = monthly(12, now - DAY, (i) => (i === 11 ? 100 : i % 2 ? 10 : -10));
  // Unemployment above forecast is bad for growth: the sign flips.
  const unrate = monthly(12, now - 15 * DAY, (i) => (i % 2 ? 0.1 : -0.1), 4);
  const scored = scoreReleases(
    new Map([
      ["nfp", nfp],
      ["unrate", unrate],
    ]),
  );
  const lastNfp = scored.filter((r) => r.def.key === "nfp").at(-1)!;
  assert.equal(lastNfp.z, 3);
  const lastUn = scored.filter((r) => r.def.key === "unrate").at(-1)!;
  assert.ok(lastUn.z! < 0, "unemployment 0.1 above forecast pulls growth down");

  // By hand: the releases inside 90 days, weight halving every 30 days.
  const inWindow = scored.filter((r) => now - r.ts < 90 * DAY);
  const w = inWindow.map((r) => r.def.weight * 0.5 ** ((now - r.ts) / (30 * DAY)));
  const expect = (inWindow.reduce((s, r, k) => s + w[k] * r.z!, 0) / w.reduce((a, b) => a + b, 0)) * 100;
  assert.ok(Math.abs(surpriseIndex(scored, "growth", now)! - expect) < 1e-9);
  assert.equal(surpriseIndex(scored, "inflation", now), null);
  assert.equal(releaseWeight(lastNfp, lastNfp.ts - 1), 0, "not yet released");
  assert.equal(releaseWeight(lastNfp, lastNfp.ts + 90 * DAY), 0, "out of the window");
});

test("surpriseView: both indices, their history and the latest releases, from the stored series", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11);
  const store = (key: string, s: ReturnType<typeof monthly>) => {
    upsertSeries(db, surpriseId(key, "actual"), "surprise", s.actual);
    upsertSeries(db, surpriseId(key, "cons"), "surprise", s.cons);
  };
  store("nfp", monthly(24, now - 2 * DAY, (i) => (i >= 21 ? 30 : i % 2 ? 20 : -20)));
  store("corecpi", monthly(24, now - 5 * DAY, (i) => (i >= 21 ? -0.1 : i % 2 ? 0.1 : -0.1), 0.3));
  const v = surpriseView(db, now, 3);
  assert.ok(v.growth.value! > 100, "payrolls beat by more than a typical miss three months running");
  assert.ok(v.inflation.value! < -50, "core CPI under forecast three months running");
  assert.equal(v.asOf, now - 2 * DAY);
  assert.equal(v.recent.length, 3);
  assert.equal(v.recent[0].def.key, "nfp");
  assert.equal(v.growth.history.at(-1)!.ts, now);
  assert.ok(v.growth.history.length > 50);
  assert.equal(v.growth.drivers[0].def.key, "nfp");
  const pulls = v.inflation.drivers.reduce((s, d) => s + d.pull, 0);
  assert.ok(Math.abs(pulls - v.inflation.value!) < 1e-9, "the pulls add up to the index");
  assert.equal(def("nfp").group, "growth");
});
