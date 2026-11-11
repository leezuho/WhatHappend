import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { upsertSeries, type Point } from "@/lib/sources/store";
import { parseCot } from "@/lib/sources/cot";
import { cotRow, cotRows, percentileRank } from "@/lib/data/cot";
import { COT_MARKETS, COT_WEEKS, cotId, type CotMarket } from "@/config/cot";

const WEEK = 7 * 86_400_000;
const GOLD: CotMarket = { key: "GOLD", code: "088691", report: "disagg", group: "mm", section: "commodity", name: { en: "Gold", vi: "Vàng" } };
const WTI: CotMarket = { key: "WTI", code: "067651", report: "disagg", group: "mm", section: "commodity", name: { en: "WTI", vi: "WTI" } };

// The shape of the CFTC yearly files: quoted header, quoted market name, bare padded numbers, CRLF in some years.
const HEAD = '"Market_and_Exchange_Names","As_of_Date_In_Form_YYMMDD","Report_Date_as_YYYY-MM-DD","CFTC_Contract_Market_Code","Open_Interest_All","M_Money_Positions_Long_All","M_Money_Positions_Short_All"';
const row = (name: string, date: string, code: string, oi: number, long: number, short: number) =>
  `"${name}",${date.slice(2).replace(/-/g, "")},${date},${code},  ${oi},  ${long},   ${short}`;

test("parseCot: the group's long − short per week, oldest first, other markets skipped", () => {
  const text = [
    HEAD,
    row("GOLD - COMMODITY EXCHANGE INC.", "2026-11-03", "088691", 399200, 150000, 46400),
    row("CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE", "2026-11-03", "090741", 348660, 1, 2),
    row("GOLD - COMMODITY EXCHANGE INC.", "2026-10-27", "088691", 400000, 152000, 46500),
    "",
  ].join("\r\n");
  const out = parseCot(text, [GOLD, WTI]);
  assert.deepEqual(out.get("GOLD"), [
    { ts: Date.UTC(2026, 9, 27), net: 105500, oi: 400000 },
    { ts: Date.UTC(2026, 10, 3), net: 103600, oi: 399200 },
  ]);
  assert.deepEqual(out.get("WTI"), []);
});

test("parseCot: a renamed column or an unreadable number fails loudly", () => {
  assert.throws(() => parseCot(HEAD.replace("M_Money_Positions_Short_All", "MM_Short"), [GOLD]), /no column M_Money_Positions_Short_All/);
  const bad = [HEAD, row("GOLD", "2026-11-03", "088691", 1, 2, 3).replace(",  2,", ",  .,")].join("\n");
  assert.throws(() => parseCot(bad, [GOLD]), /GOLD long not a number/);
});

test("percentileRank: share of the earlier weeks below the latest, ties count half", () => {
  assert.equal(percentileRank([1, 2, 3]), 100);
  assert.equal(percentileRank([3, 2, 1]), 0);
  assert.equal(percentileRank([1, 3, 2]), 50);
  assert.equal(percentileRank([2, 2, 2]), 50);
  assert.equal(percentileRank([5]), null);
});

const weeks = (values: number[], start = Date.UTC(2023, 0, 3)): Point[] => values.map((value, i) => ({ ts: start + i * WEEK, value }));

test("cotRow: net % of open interest, weekly change, rank over the last 156 weeks", () => {
  // 200 weeks climbing from −50% to +49.5% of a fixed open interest; the window keeps the last 156.
  const net = weeks(Array.from({ length: 200 }, (_, i) => (i - 100) * 1000));
  const oi = weeks(Array(200).fill(200_000));
  const r = cotRow(GOLD, net, oi);
  assert.equal(r.net, 99_000);
  assert.equal(r.netPct, 49.5);
  assert.equal(r.weekChange, 1000);
  assert.equal(r.rank, 100);
  assert.equal(r.extreme, "high");
  assert.equal(r.history.length, COT_WEEKS);
  assert.ok(Math.abs(r.history[0].value - -28) < 1e-9, "window starts at week 44: −56K of 200K");
  assert.equal(r.asOf, net[199].ts);

  // A short history has no rank; a week without open interest is left out of the percentages.
  const short = cotRow(GOLD, weeks([10, 20, 30]), weeks([100, 0, 100]));
  assert.equal(short.rank, null);
  assert.equal(short.extreme, null);
  assert.deepEqual(short.history.map((p) => p.value), [10, 30]);
  assert.equal(short.weekChange, 10);

  // A position at the bottom of its range reads "low" whatever its sign.
  const low = cotRow(GOLD, weeks([...Array.from({ length: 60 }, (_, i) => 5000 + i), 4000]), weeks(Array(61).fill(100_000)));
  assert.equal(low.rank, 0);
  assert.equal(low.extreme, "low");
  assert.ok(low.netPct! > 0);
});

test("cotRows: one row per configured market, read from the stored series", () => {
  const db = openDb(":memory:");
  upsertSeries(db, cotId("GOLD", "net"), "cot", weeks([100, 200]));
  upsertSeries(db, cotId("GOLD", "oi"), "cot", weeks([1000, 1000]));
  const rows = cotRows(db);
  assert.deepEqual(rows.map((r) => r.key), COT_MARKETS.map((m) => m.key));
  const gold = rows.find((r) => r.key === "GOLD")!;
  assert.equal(gold.netPct, 20);
  assert.equal(gold.weekChange, 100);
  assert.equal(rows.find((r) => r.key === "WTI")!.net, null);
});
