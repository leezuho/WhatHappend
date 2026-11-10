import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { callsLeft, callsToday, dailyLimit, isDailyQuotaError, isExhausted, markExhausted, quotaDay, recordCall } from "@/lib/ai/budget";
import type { AiConfig } from "@/lib/ai/config";
import { cellText, changesSince, isoWeek } from "@/lib/ai/macronote";
import type { StoredMacroNote } from "@/lib/ai/macronote-shared";
import { mapBin } from "@/lib/signals/macro";

// Free-tier budget for AI calls, and the weekly macro note's pure parts.

const gemini: AiConfig = { provider: "gemini", apiKey: "x", models: { brief: "gemini-flash-latest", fast: "gemini-flash-lite-latest" } };
const claude: AiConfig = { provider: "anthropic", apiKey: "sk-ant-x", models: { brief: "claude-sonnet-5-5", fast: "claude-haiku-5-5" } };

test("quotaDay: the Pacific-time day Google resets free-tier quotas on", () => {
  // 07:59 UTC on 9 Nov is still 8 Nov in Los Angeles (PST, UTC−8); 08:00 is the 9th.
  assert.equal(quotaDay(Date.UTC(2026, 10, 9, 7, 59)), "2026-11-08");
  assert.equal(quotaDay(Date.UTC(2026, 10, 9, 8, 0)), "2026-11-09");
});

test("dailyLimit: 20 for Gemini's brief model unless overridden, unlimited otherwise; 0 means unlimited", () => {
  assert.equal(dailyLimit(gemini, "brief", {}), 20);
  assert.equal(dailyLimit(gemini, "fast", {}), Infinity);
  assert.equal(dailyLimit(claude, "brief", {}), Infinity);
  assert.equal(dailyLimit(gemini, "brief", { AI_DAILY_LIMIT_BRIEF: "250" }), 250);
  assert.equal(dailyLimit(gemini, "brief", { AI_DAILY_LIMIT_BRIEF: "0" }), Infinity);
  assert.equal(dailyLimit(gemini, "fast", { AI_DAILY_LIMIT_FAST: "1000" }), 1000);
  assert.equal(dailyLimit(gemini, "brief", { AI_DAILY_LIMIT_BRIEF: "abc" }), 20);
});

test("budget: calls are counted per model and quota day; a daily-quota error closes the model until the reset", () => {
  const db = openDb(":memory:");
  const before = process.env.AI_DAILY_LIMIT_BRIEF;
  delete process.env.AI_DAILY_LIMIT_BRIEF;
  try {
    const day1 = Date.UTC(2026, 10, 9, 9);
    for (let i = 0; i < 3; i++) recordCall(db, "gemini-flash-latest", day1);
    recordCall(db, "gemini-flash-lite-latest", day1);
    assert.equal(callsToday(db, "gemini-flash-latest", day1), 3);
    assert.equal(callsLeft(db, gemini, "brief", day1), 17);
    assert.equal(callsLeft(db, gemini, "fast", day1), Infinity);
    // The next Pacific day starts from zero.
    assert.equal(callsLeft(db, gemini, "brief", day1 + 24 * 3600_000), 20);

    markExhausted(db, "gemini-flash-latest", day1);
    assert.ok(isExhausted(db, "gemini-flash-latest", day1));
    assert.equal(callsLeft(db, gemini, "brief", day1), 0);
    assert.equal(callsLeft(db, gemini, "fast", day1), Infinity, "the other model keeps its own quota");
    assert.ok(!isExhausted(db, "gemini-flash-latest", day1 + 24 * 3600_000), "lifted on the next quota day");
  } finally {
    if (before !== undefined) process.env.AI_DAILY_LIMIT_BRIEF = before;
    db.close();
  }
});

test("isDailyQuotaError: a per-day 429 yes, a per-minute burst or another error no", () => {
  const daily = { status: 429, message: '{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests ... requests per day limit exceeded"}}' };
  const minute = { status: 429, message: "Quota exceeded: requests per minute per model" };
  assert.ok(isDailyQuotaError(daily));
  assert.ok(!isDailyQuotaError(minute));
  assert.ok(!isDailyQuotaError(new Error("HTTP 503 model overloaded")));
});

test("isoWeek: ISO weeks in Vietnam time", () => {
  assert.equal(isoWeek(Date.UTC(2026, 10, 9, 3)), "2026-W46"); // Monday 9 Nov
  assert.equal(isoWeek(Date.UTC(2026, 10, 8, 16, 59)), "2026-W45"); // Sunday 23:59 in Hanoi
  assert.equal(isoWeek(Date.UTC(2026, 10, 8, 17, 0)), "2026-W46"); // Monday 00:00 in Hanoi
  assert.equal(isoWeek(Date.UTC(2027, 0, 1, 5)), "2026-W53"); // Friday 1 Jan 2027 belongs to 2026's last week
});

test("macro note input: cells as compact text, and only real changes since last week", () => {
  assert.deepEqual(cellText("cpi", { value: 3.71, ts: Date.UTC(2026, 8, 1), freq: "m", status: "warn" }), { s: "3.7 Sep '26 [warn]", v: 3.71 });
  assert.deepEqual(cellText("debt", { value: 127.4, ts: Date.UTC(2026, 0, 1), freq: "y", status: "crit", est: true }), { s: "127 IMF est 2026 [crit]", v: 127.4 });
  assert.deepEqual(cellText("cli", { value: 100.33, ts: Date.UTC(2026, 8, 1), freq: "m", status: null, trend: "up" }), { s: "100.3 Sep '26 rising", v: 100.33 });
  assert.deepEqual(cellText("y10", { value: null, ts: null, freq: null, status: null }), { s: "n/a", v: null });

  const snap = (cpi: string, y10: number, fx: number): StoredMacroNote["snapshot"] => ({
    Japan: { cpi: { s: cpi, v: 0 }, y10: { s: y10.toFixed(2), v: y10 }, fx: { s: fx.toFixed(1), v: fx }, real: { s: "x", v: 1 } },
  });
  assert.deepEqual(changesSince(undefined, snap("2.2 Sep '26", 2.7, -1)), []);
  assert.deepEqual(changesSince(snap("2.0 Aug '26", 2.7, -1), snap("2.2 Sep '26", 2.75, -1.5)), ["Japan cpi: 2.0 Aug '26 → 2.2 Sep '26"], "small market moves are noise");
  assert.deepEqual(changesSince(snap("2.2 Sep '26", 2.4, 1), snap("2.2 Sep '26", 2.7, -2)), ["Japan y10: 2.40 → 2.70", "Japan fx: 1.0 → -2.0"]);
});

test("mapBin: values fall in the class whose lower threshold they reach", () => {
  const t = [-5, -2.5, -0.5, 0.5, 2.5, 5];
  assert.equal(mapBin(-9, t), 0);
  assert.equal(mapBin(-5, t), 1);
  assert.equal(mapBin(0, t), 3);
  assert.equal(mapBin(8.4, t), 6);
  assert.equal(mapBin(1.9, [2, 3, 5, 10, 20]), 0);
  assert.equal(mapBin(25, [2, 3, 5, 10, 20]), 5);
});
