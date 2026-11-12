import assert from "node:assert/strict";
import { test } from "node:test";
import { informativeEvents, openOutcomes } from "@/lib/data/prediction";

// Prediction-market odds worth showing (TODO P3): settled outcomes hidden, biggest 24-hour move first.

const o = (label: string, prob: number, change24h: number | null = null) => ({ label, prob, change24h });
const ev = (id: string, volume24hr: number, outcomes: ReturnType<typeof o>[]) => ({ id, data: { tag: "geopolitics", volume24hr, outcomes } });

test("openOutcomes: 97% and more, 3% and less are hidden, as printed (whole percent)", () => {
  assert.deepEqual(
    openOutcomes([o("Nov 11", 0.9975), o("Nov 15", 0.9695), o("Nov 18", 0.9555), o("Dec 31", 0.03), o("Mar 31", 0.0305), o("Jun 30", 0.036)]).map((x) => x.label),
    ["Nov 18", "Jun 30"],
  );
});

test("informativeEvents: settled events dropped, the rest ordered by their largest 24-hour move, then volume", () => {
  const out = informativeEvents([
    ev("settled", 900, [o("25 bps increase", 0.975, 0.01), o("No change", 0.02, -0.01)]),
    ev("longshot", 800, [o("Yes", 0.0135, -0.002)]),
    ev("calm", 700, [o("Yes", 0.4, 0.01)]),
    ev("moving", 100, [o("December 31", 0.305, -0.29), o("November 15", 0.01, -0.3)]),
    ev("calm-big", 750, [o("Yes", 0.6, 0.01)]),
  ]);
  assert.deepEqual(out.map((e) => e.id), ["moving", "calm-big", "calm"]);
  // The 1% outcome's move does not count once it is hidden.
  assert.deepEqual(out[0].data.outcomes.map((x) => x.label), ["December 31"]);
});
