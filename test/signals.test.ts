import assert from "node:assert/strict";
import { test } from "node:test";
import { SERIES } from "@/config/series";
import { openDb } from "@/lib/db";
import { getTile } from "@/lib/data/series";
import { dayTs, upsertSeries, type Point } from "@/lib/sources/store";
import { alertOf, findNotables, scoreOf } from "@/lib/signals/notable";
import { computeRegime, mergeDaily } from "@/lib/signals/risk-regime";

const DAY = 24 * 3600_000;

/** n daily points ending today, value(i) for i = 0..n-1. */
function daily(n: number, value: (i: number) => number): Point[] {
  const end = dayTs(Date.now());
  return Array.from({ length: n }, (_, i) => ({ ts: end - (n - 1 - i) * DAY, value: value(i) }));
}

const ramp = (from: number, to: number, n = 250) => daily(n, (i) => from + ((to - from) * i) / (n - 1));

test("alertOf: warn and crit in the dangerous direction only", () => {
  // VIX: dir above, warn 25, crit 35.
  assert.equal(alertOf(SERIES.vix, 20), null);
  assert.equal(alertOf(SERIES.vix, 30), "warn");
  assert.equal(alertOf(SERIES.vix, 40), "crit");
});

test("computeRegime: needs at least two gauges", () => {
  assert.equal(computeRegime({ vix: ramp(30, 12) }).regime, "unknown");
});

test("computeRegime: calm gauges at their yearly extremes read risk-on", () => {
  const r = computeRegime({ vix: ramp(30, 12), credit: ramp(5, 3), curve: ramp(-0.5, 1) });
  assert.equal(r.regime, "risk-on");
  assert.ok(r.score !== null && r.score <= -0.5);
});

test("computeRegime: rising stress reads risk-off, VIX above 35 overrides", () => {
  const stressed = computeRegime({ vix: ramp(12, 30), credit: ramp(3, 5), curve: ramp(1, -0.5) });
  assert.equal(stressed.regime, "risk-off");
  assert.equal(stressed.override, undefined);

  // A VIX print above 35 forces risk-off and says why.
  const panic = computeRegime({ vix: daily(250, (i) => (i === 249 ? 40 : 15 + Math.sin(i))), credit: ramp(5, 3), curve: ramp(-0.5, 1) });
  assert.equal(panic.regime, "risk-off", "a VIX panic switches at once, without waiting a second session");
  assert.match(panic.override ?? "", /VIX > 35/);
});

/** Ten years and a bit of daily noise around `base` (sd ≈ amp/√2), with the last values replaced by `tail`. */
const noisy = (base: number, amp: number, tail: number[] = [], n = 3800) => daily(n, (i) => (i >= n - tail.length ? tail[i - (n - tail.length)] : base + amp * Math.sin(i * 0.7)));

test("computeRegime v2: a stress reading must hold two sessions before the regime changes", () => {
  // Noise in opposite phase keeps every earlier session neutral.
  const one = computeRegime({ vix: noisy(15, 2, [30]), credit: noisy(2, -0.2, [3.5]) });
  assert.equal(one.regime, "neutral", "one stressed session");
  assert.equal(one.pending, "risk-off");
  assert.ok(one.score! >= 0.75);

  const two = computeRegime({ vix: noisy(15, 2, [30, 30]), credit: noisy(2, -0.2, [3.5, 3.5]) });
  assert.equal(two.regime, "risk-off");
  assert.equal(two.pending, null);
  assert.equal(two.since, dayTs(Date.now()) - DAY, "the run started the session before");
  assert.equal(two.sinceAtLeast, false);

  // A one-session dip back does not undo it either.
  const blip = computeRegime({ vix: noisy(15, 2, [30, 30, 15]), credit: noisy(2, -0.2, [3.5, 3.5, 2]) });
  assert.equal(blip.regime, "risk-off");
  assert.equal(blip.pending, "neutral");
});

test("computeRegime v2: a level is judged against ten years, not the last one", () => {
  // Spreads near 5% for nine years, then a tight year around 2.6%, now 3.4%: high for the year, low for the decade.
  const n = 3800;
  const credit = daily(n, (i) => (i === n - 1 ? 3.4 : i < n - 365 ? 5 + Math.sin(i * 0.7) : 2.6 + 0.1 * Math.sin(i * 0.7)));
  const r = computeRegime({ vix: noisy(15, 2), credit });
  const c = r.components.find((x) => x.key === "credit")!;
  assert.ok(c.z < 0, `z ${c.z}`);
  assert.equal(c.years, 10);
  assert.equal(c.value, 3.4);
});

test("computeRegime v2: late readings count half, very late ones not at all; z is clamped to ±3", () => {
  const now = Date.now();
  const late = (days: number) => noisy(2, 0.2, [9]).map((p) => ({ ...p, ts: p.ts - days * DAY }));
  const half = computeRegime({ vix: noisy(15, 2), credit: late(8) }, now);
  assert.deepEqual(
    half.components.map((c) => [c.key, c.weight]),
    [
      ["vix", 1],
      ["credit", 0.5],
    ],
  );
  assert.equal(half.components[1].z, 3, "clamped");
  assert.equal(computeRegime({ vix: noisy(15, 2), credit: late(20) }, now).regime, "unknown", "credit dropped, one gauge left");
});

test("computeRegime v2: credit divergence when HY widens 50 bp off its 3-month low while the S&P trends up", () => {
  const hy = daily(120, (i) => (i < 60 ? 2.6 : 2.6 + (0.6 * (i - 59)) / 60));
  const up = daily(400, (i) => 5000 + 5 * i);
  const r = computeRegime({ vix: noisy(15, 2), credit: noisy(2, 0.2), hy, spx: up });
  assert.ok(r.divergence);
  assert.equal(r.divergence.low, 2.6);
  assert.ok(Math.abs(r.divergence.hy - 3.2) < 1e-9);
  assert.ok(r.divergence.spxGap > 0);

  const down = daily(400, (i) => 7000 - 5 * i);
  assert.equal(computeRegime({ vix: noisy(15, 2), credit: noisy(2, 0.2), hy, spx: down }).divergence, null, "a sell-off is not a divergence");
  const small = daily(120, (i) => (i < 60 ? 2.6 : 2.6 + (0.4 * (i - 59)) / 60));
  assert.equal(computeRegime({ vix: noisy(15, 2), credit: noisy(2, 0.2), hy: small, spx: up }).divergence, null, "40 bp is not enough");
});

test("computeRegime v2: breadth counts markets above their 50-session average on a fixed scale", () => {
  const markets = Array.from({ length: 20 }, (_, k) => daily(80, (i) => (k < 15 ? 100 + i : 200 - i)));
  const r = computeRegime({ vix: noisy(15, 2), credit: noisy(2, 0.2), markets });
  const b = r.components.find((c) => c.key === "breadth")!;
  assert.deepEqual(b.count, { above: 15, total: 20 });
  assert.equal(b.z, -0.5);
});

test("mergeDaily: one series per day, the live source wins", () => {
  const d = dayTs(Date.now());
  assert.deepEqual(
    mergeDaily(
      [
        { ts: d - DAY, value: 1 },
        { ts: d, value: 2 },
      ],
      [{ ts: d, value: 3 }],
    ),
    [
      { ts: d - DAY, value: 1 },
      { ts: d, value: 3 },
    ],
  );
});

test("findNotables: a VIX spike is flagged as danger, unusual move and 1-year high; a quiet series is not", () => {
  const db = openDb(":memory:");
  upsertSeries(db, SERIES.vix.id, "yahoo", daily(300, (i) => (i === 299 ? 40 : 15 + 0.5 * Math.sin(i))));
  upsertSeries(db, SERIES.spx.id, "yahoo", daily(300, (i) => 5000 + 10 * Math.sin(i)));

  const notables = findNotables(db);
  const vix = notables.find((n) => n.key === "vix");
  assert.ok(vix, "vix should be notable");
  assert.deepEqual(vix.reasons.map((r) => r.kind).sort(), ["crit", "high", "move"]);
  assert.equal(notables.find((n) => n.key === "spx"), undefined);
});

test("tile range: 1-year low/high including the live value, only with a year of history", () => {
  const db = openDb(":memory:");
  const def = SERIES.vix;
  // A full year of daily points from 30 down to 12.
  upsertSeries(db, def.id, "test", ramp(30, 12, 365));
  assert.deepEqual(getTile(db, def)?.range, { lo: 12, hi: 30 });
  // A live quote outside the stored range widens it.
  db.prepare("INSERT INTO quotes (series_id, price, change, change_pct, ts) VALUES (?, ?, ?, ?, ?)").run(def.id, 40, 1, 2.5, Date.now());
  assert.deepEqual(getTile(db, def)?.range, { lo: 12, hi: 40 });

  // Three months of history is not a year: no range bar.
  const young = SERIES.hy;
  upsertSeries(db, young.id, "test", daily(90, (i) => 3 + i / 100));
  assert.equal(getTile(db, young)?.range, undefined);
});

// ---------------------------------------------------------------- what stands out: new first (2026-11-11)

test("findNotables: a threshold just crossed is new; one crossed long ago fades out, a danger level stays at the bottom", () => {
  const fresh = openDb(":memory:");
  upsertSeries(fresh, SERIES.vix.id, "yahoo", daily(300, (i) => (i >= 298 ? 28 : 15 + 0.5 * Math.sin(i))));
  const vix = findNotables(fresh).find((n) => n.key === "vix");
  const warn = vix?.reasons.find((r) => r.kind === "warn");
  assert.ok(warn && warn.kind === "warn" && warn.fresh, "crossed two sessions ago");
  assert.equal(warn.since, dayTs(Date.now()) - DAY);

  const old = openDb(":memory:");
  upsertSeries(old, SERIES.vix.id, "yahoo", daily(300, (i) => 28 + 0.5 * Math.sin(i)));
  assert.equal(findNotables(old).find((n) => n.key === "vix"), undefined, "above the watch level for 300 days");

  const danger = openDb(":memory:");
  upsertSeries(danger, SERIES.vix.id, "yahoo", daily(300, (i) => 40 + 0.5 * Math.sin(i)));
  const crit = findNotables(danger).find((n) => n.key === "vix");
  assert.ok(crit, "an old danger level is still listed");
  assert.equal(crit.score, 0.75);
});

test("findNotables: a steady slide shows as a big move over the week even when no single session stands out", () => {
  const db = openDb(":memory:");
  // A 7-day cycle cancels over any week; then seven sessions of −0.5% each.
  const price = (i: number) => (i < 293 ? 80 * (1 + 0.01 * Math.sin((2 * Math.PI * i) / 7)) : 80 * 0.995 ** (i - 292));
  upsertSeries(db, SERIES.brent.id, "yahoo", daily(300, price));
  const brent = findNotables(db).find((n) => n.key === "brent");
  assert.ok(brent, "brent is notable");
  const week = brent.reasons.find((r) => r.kind === "week");
  assert.ok(week && week.kind === "week" && week.z <= -2);
  assert.ok(Math.abs(week.change - (price(299) / price(292) - 1) * 100) < 1e-9, `change ${week.change}`);
  assert.equal(brent.reasons.find((r) => r.kind === "move"), undefined, "no single session is unusual");
});

test("scoreOf: new beats old, and a session move and a week move do not add up", () => {
  const now = Date.now();
  assert.equal(scoreOf([{ kind: "warn", since: now, fresh: true }], now), 3);
  assert.equal(scoreOf([{ kind: "warn", since: now - 30 * DAY, fresh: false }], now), 0.75);
  assert.equal(scoreOf([{ kind: "crit", since: now - 300 * DAY, fresh: false }], now), 0.75);
  assert.ok(Math.abs(scoreOf([{ kind: "move", z: 3 }, { kind: "week", z: -4, change: -12 }], now) - 2.4) < 1e-9);
});
