import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { WORLD_INDEX_SYMBOLS, WORLD_INDICES } from "@/config/markets";
import { YAHOO_SYMBOLS } from "@/config/series";
import { upsertQuotes, upsertSeries } from "@/lib/sources/store";
import { worldIndexRows } from "@/lib/data/markets";

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 10, 10, 8);

test("world indices: every Yahoo one is pulled by the yahoo source, VN-Index comes from SSI", () => {
  for (const s of WORLD_INDEX_SYMBOLS) assert.ok(YAHOO_SYMBOLS.includes(s), `${s} missing from YAHOO_SYMBOLS`);
  assert.ok(WORLD_INDICES.some((i) => i.id === "vn:VNINDEX"));
  assert.ok(!WORLD_INDEX_SYMBOLS.some((s) => s.includes("VNINDEX")), "VN-Index is not asked of Yahoo");
  assert.equal(new Set(WORLD_INDICES.map((i) => i.id)).size, WORLD_INDICES.length, "no index listed twice");
});

test("worldIndexRows: session change from the quote, week/month/YTD from stored closes", () => {
  const db = openDb(":memory:");
  const yearStart = Date.UTC(2026, 0, 1);
  upsertSeries(db, "yahoo:^N225", "yahoo", [
    { ts: yearStart - DAY, value: 50_000 },
    { ts: NOW - 31 * DAY, value: 55_000 },
    { ts: NOW - 8 * DAY, value: 58_000 },
    { ts: NOW - DAY, value: 59_000 },
  ]);
  upsertQuotes(db, [{ seriesId: "yahoo:^N225", price: 60_000, changePct: 1.7, ts: NOW }]);
  // VN-Index: history only, no live quote yet.
  upsertSeries(db, "vn:VNINDEX", "vnindex", [
    { ts: yearStart - DAY, value: 1_250 },
    { ts: NOW - DAY, value: 1_500 },
  ]);

  const rows = worldIndexRows(db, "vi", NOW);
  assert.equal(rows.length, WORLD_INDICES.length);

  const n225 = rows.find((r) => r.id === "yahoo:^N225")!;
  assert.equal(n225.country, "Nhật Bản");
  assert.equal(n225.price, 60_000);
  assert.equal(n225.ch1d, 1.7);
  assert.ok(Math.abs(n225.ch1w! - (60_000 / 58_000 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(n225.ch1m! - (60_000 / 55_000 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(n225.chYtd! - 20) < 1e-9);

  const vn = rows.find((r) => r.id === "vn:VNINDEX")!;
  assert.equal(vn.price, 1_500, "falls back to the last close");
  assert.equal(vn.ch1d, null);
  assert.ok(Math.abs(vn.chYtd! - 20) < 1e-9);

  const empty = rows.find((r) => r.id === "yahoo:^FTSE")!;
  assert.deepEqual([empty.price, empty.ch1d, empty.chYtd, empty.spark.length], [null, null, null, 0]);
});
