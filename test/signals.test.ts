import assert from "node:assert/strict";
import { test } from "node:test";
import { SERIES } from "@/config/series";
import { openDb } from "@/lib/db";
import { dayTs, upsertSeries, type Point } from "@/lib/sources/store";
import { alertOf, findNotables } from "@/lib/signals/notable";
import { computeRegime } from "@/lib/signals/risk-regime";

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
  const r = computeRegime({ vix: ramp(30, 12), hy: ramp(5, 3), curve: ramp(-0.5, 1) });
  assert.equal(r.regime, "risk-on");
  assert.ok(r.score !== null && r.score <= -0.5);
});

test("computeRegime: rising stress reads risk-off, VIX above 35 overrides", () => {
  const stressed = computeRegime({ vix: ramp(12, 30), hy: ramp(3, 5), curve: ramp(1, -0.5) });
  assert.equal(stressed.regime, "risk-off");
  assert.equal(stressed.override, undefined);

  // A VIX print above 35 forces risk-off and says why.
  const panic = computeRegime({ vix: daily(250, (i) => (i === 249 ? 40 : 15 + Math.sin(i))), hy: ramp(5, 3), curve: ramp(-0.5, 1) });
  assert.equal(panic.regime, "risk-off");
  assert.match(panic.override ?? "", /VIX > 35/);
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
