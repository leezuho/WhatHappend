import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { ASSET_CLASSES, COMMODITIES, MARKET_EXTRA_SYMBOLS } from "@/config/markets";
import { imfCpiId, imfId, oecdId } from "@/config/macro";
import { replaceEvents, upsertQuotes, upsertSeries } from "@/lib/sources/store";
import { kevByVendor } from "@/lib/sources/kev";
import type { ServiceStatus } from "@/lib/sources/cloudstatus";
import { assetClassRows, commodityRows, ratioSeries, spreadHistory, spreadRun } from "@/lib/data/markets";
import { vn30Rows } from "@/lib/sources/vnstocks";
import { VN_CENTRAL_RATE, VN_FOREIGN } from "@/config/vietnam";
import { centralOf } from "@/lib/sources/sbvrate";
import { lastChange } from "@/lib/sources/petrolimex";
import { parseRecap, recapLinks } from "@/lib/sources/ibrate";
import { dailyFundingApr } from "@/lib/sources/binance";
import { tvlChange } from "@/lib/sources/defillama";
import { btcLeverage, etfFlows } from "@/lib/data/crypto";
import { BTC_ETF, BTC_HISTORY } from "@/config/series";
import { parseEtfTable } from "@/lib/sources/etfflows";
import { clusterStories, titleWords } from "@/lib/data/news";
import { rocMonth, twRevenueRows } from "@/lib/sources/twse";
import { hiringMonth } from "@/lib/sources/hnhiring";
import { eolRow } from "@/lib/sources/eol";
import { techInput } from "@/lib/ai/technote";
import { replaceItems } from "@/lib/sources/store";
import { centralBand, dollarHistory, foreignFlows, goldPremiumHistory, hanoiDay, nthWeekday, OZ_PER_LUONG, vnHazards, vnMarketDates, vnRatesHistory } from "@/lib/data/vietnam";
import { splitStatus } from "@/lib/data/tech";
import { growthInflation, usCpiParts } from "@/lib/data/macro";
import { US_CPI_PARTS } from "@/config/macro";
import { FRED_CODES, SERIES, YAHOO_SYMBOLS } from "@/config/series";
import { spreadBp } from "@/lib/signals/macro";
import { writeDerived } from "@/lib/sources/fred";
import { actualValue, addActuals, fmtActual, parseFigure, refPeriod } from "@/lib/sources/calendar";
import { CALENDAR_ACTUALS } from "@/config/calendar";
import { parseFredCalendar } from "@/lib/sources/releases";
import { fmtDelta, fmtValue } from "@/lib/format";
import { squarify } from "@/lib/treemap";
import { logAxis, placeLabels } from "@/components/charts/QuadrantScatter";
import { joinArena, modelKey } from "@/lib/sources/arena";
import { kpPoints } from "@/lib/sources/spaceweather";
import { weeklyTotals } from "@/lib/sources/pkgtrends";
import { computeModels, frontier, growthPerYear } from "@/lib/sources/epoch";
import { packageRows } from "@/lib/data/tech";
import { PACKAGES, pkgId } from "@/config/tech";

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 10, 10, 8);

// ---------------------------------------------------------------- overview

test("commodities and asset classes: every Yahoo symbol is pulled; rows in config order, asset classes best first", () => {
  for (const s of MARKET_EXTRA_SYMBOLS) assert.ok(YAHOO_SYMBOLS.includes(s), `${s} missing from YAHOO_SYMBOLS`);
  const db = openDb(":memory:");
  const yearEnd = Date.UTC(2025, 11, 31);
  upsertSeries(db, "yahoo:BZ=F", "yahoo", [{ ts: yearEnd, value: 60 }]);
  upsertQuotes(db, [{ seriesId: "yahoo:BZ=F", price: 90, changePct: -1.2, ts: NOW }]);
  upsertSeries(db, "yahoo:BTC-USD", "yahoo", [
    { ts: yearEnd, value: 100_000 },
    { ts: NOW - DAY, value: 85_000 },
  ]);

  const rows = commodityRows(db, "vi", NOW);
  assert.deepEqual(
    rows.map((r) => r.id),
    COMMODITIES.map((c) => c.id),
  );
  const brent = rows.find((r) => r.id === "yahoo:BZ=F")!;
  assert.equal(brent.unit, "$/thùng");
  assert.equal(brent.ch1d, -1.2);
  assert.ok(Math.abs(brent.chYtd! - 50) < 1e-9);

  const assets = assetClassRows(db, "en", NOW);
  assert.equal(assets.length, ASSET_CLASSES.length);
  assert.deepEqual(
    assets.slice(0, 2).map((a) => [a.id, Math.round(a.ytd!)]),
    [
      ["yahoo:BZ=F", 50],
      ["yahoo:BTC-USD", -15],
    ],
  );
  assert.equal(assets.at(-1)!.ytd, null, "no history: last");
});

test("spreadRun: the current stretch above or below zero, over all stored history", () => {
  const pts = [-0.5, -0.2, 0.1, -0.1, 0.2, 0.3].map((value, i) => ({ ts: i * DAY, value }));
  assert.deepEqual(spreadRun("s2s10", pts), { key: "s2s10", value: 0.3, inverted: false, since: 4 * DAY, atLeast: false });
  assert.deepEqual(spreadRun("s3m10", pts.slice(0, 2)), { key: "s3m10", value: -0.2, inverted: true, since: 0, atLeast: true });
  assert.equal(spreadRun("s2s10", []), null);
});

test("spreadHistory: both spreads on one row per day, within the window", () => {
  const db = openDb(":memory:");
  upsertSeries(db, "fred:T10Y2Y", "fred", [
    { ts: NOW - 900 * DAY, value: -0.4 },
    { ts: NOW - 2 * DAY, value: 0.5 },
    { ts: NOW - DAY, value: 0.6 },
  ]);
  upsertSeries(db, "fred:T10Y3M", "fred", [{ ts: NOW - DAY, value: 0.7 }]);
  const h = spreadHistory(db, 730, NOW);
  assert.deepEqual(h.rows.at(-1), { ts: NOW - DAY, s2s10: 0.6, s3m10: 0.7 });
  assert.ok(h.rows.every((r) => r.ts >= NOW - 730 * DAY));
  assert.equal(h.runs.find((r) => r.key === "s2s10")!.since, NOW - 2 * DAY, "run found from history older than the window");
});

test("ratioSeries: only days both series have", () => {
  const db = openDb(":memory:");
  upsertSeries(db, "a", "t", [
    { ts: 1 * DAY, value: 3 },
    { ts: 2 * DAY, value: 4 },
  ]);
  upsertSeries(db, "b", "t", [
    { ts: 2 * DAY, value: 100 },
    { ts: 3 * DAY, value: 100 },
  ]);
  assert.deepEqual(ratioSeries(db, "a", "b", 0), [{ ts: 2 * DAY, value: 0.04 }]);
});

// ---------------------------------------------------------------- Vietnam

test("vnMarketDates: VN30 futures on the third Thursday, statistics on the 6th, quarter months flagged by month", () => {
  assert.equal(nthWeekday(2026, 10, 4, 3), Date.UTC(2026, 10, 19));
  assert.equal(nthWeekday(2027, 0, 4, 3), Date.UTC(2027, 0, 21));
  const dates = vnMarketDates(NOW, NOW + 45 * DAY);
  assert.deepEqual(
    dates.map((d) => [d.kind, new Date(d.ts).toISOString().slice(0, 10), d.month + 1]),
    [
      ["vn30f", "2026-11-19", 11],
      ["gso", "2026-12-06", 11],
      ["vn30f", "2026-12-17", 12],
    ],
  );
  // The day itself still counts in the afternoon.
  assert.equal(vnMarketDates(Date.UTC(2026, 10, 19, 9), Date.UTC(2026, 10, 20))[0].kind, "vn30f");
});

test("vnRatesHistory: monthly CPI beside the refinancing rate in force at each month's end", () => {
  const db = openDb(":memory:");
  upsertSeries(db, "imf:CPI_M:VNM", "imfcpi", [
    { ts: Date.UTC(2026, 7, 1), value: 4.9 },
    { ts: Date.UTC(2026, 8, 1), value: 5.1 },
  ]);
  upsertSeries(db, "sbv:REFI", "sbv", [
    { ts: Date.UTC(2026, 6, 1), value: 5 },
    { ts: Date.UTC(2026, 8, 15), value: 4.5 },
  ]);
  const rows = vnRatesHistory(db, 4, NOW);
  assert.deepEqual(rows, [
    { ts: Date.UTC(2026, 7, 1), cpi: 4.9, refi: 5 },
    { ts: Date.UTC(2026, 8, 1), cpi: 5.1, refi: 4.5 },
    { ts: Date.UTC(2026, 9, 1), cpi: null, refi: 4.5 },
    { ts: Date.UTC(2026, 10, 1), cpi: null, refi: 4.5 },
  ]);
});

test("vnHazards: storms from the wider sea, other hazards from the box, news events never; nearest first", () => {
  const db = openDb(":memory:");
  replaceEvents(db, "eonet", [
    { id: "eonet:1", type: "storm", title: "Typhoon A", lat: 15, lng: 125, severity: 90, ts: NOW - DAY },
    { id: "eonet:2", type: "storm", title: "Typhoon far", lat: 25, lng: 138, ts: NOW - DAY },
    { id: "eonet:3", type: "wildfire", title: "Fire east", lat: 15, lng: 125, ts: NOW - DAY },
  ]);
  replaceEvents(db, "usgs", [{ id: "usgs:1", type: "earthquake", title: "M5 near Dien Bien", lat: 21.4, lng: 103, severity: 5, ts: NOW - 2 * DAY }]);
  replaceEvents(db, "gdelt", [{ id: "gdelt:1", type: "conflict", title: "Fighting — Vietnam", lat: 16, lng: 108, ts: NOW }]);
  const items = vnHazards(db, "vi", 14, NOW);
  assert.deepEqual(
    items.map((h) => h.id),
    ["usgs:1", "eonet:1"],
  );
  assert.equal(items[0].city, "Hà Nội");
  assert.ok(items[0].km > 250 && items[0].km < 320, `${items[0].km}`);
});

// ---------------------------------------------------------------- tech

test("kevByVendor: counts per vendor in the window, ransomware tallied, most first", () => {
  const v = (cve: string, vendor: string, added: string, ransomware = false) => ({
    cveID: cve,
    vendorProject: vendor,
    product: "x",
    vulnerabilityName: "y",
    dateAdded: added,
    knownRansomwareCampaignUse: ransomware ? "Known" : "Unknown",
  });
  const r = kevByVendor(
    [v("CVE-1", "Ivanti", "2026-11-01", true), v("CVE-2", "Ivanti", "2026-10-01"), v("CVE-3", "Cisco", "2026-09-01"), v("CVE-4", "Cisco", "2025-01-01")],
    NOW,
    90,
  );
  assert.equal(r.total, 3);
  assert.deepEqual(r.rows, [
    { vendor: "Ivanti", n: 2, ransomware: 1 },
    { vendor: "Cisco", n: 1, ransomware: 0 },
  ]);
});

test("splitStatus: months-old incidents no longer set the level; a fresh one or a worse page indicator still does", () => {
  const inc = (impact: "minor" | "major", daysAgo: number) => ({ title: "t", impact, status: null, since: NOW - daysAgo * DAY, where: null, url: null });
  const aws: ServiceStatus = { level: "major", description: null, incidents: [inc("major", 250), inc("major", 251)] };
  const a = splitStatus(aws, NOW);
  assert.equal(a.level, "none");
  assert.equal(a.long.length, 2);

  const mixed = splitStatus({ level: "major", description: null, incidents: [inc("major", 250), inc("minor", 1)] }, NOW);
  assert.equal(mixed.level, "minor");
  assert.equal(mixed.current.length, 1);

  // Statuspage says major while the only incidents listed are old minor ones: the indicator stands.
  assert.equal(splitStatus({ level: "major", description: null, incidents: [inc("minor", 30)] }, NOW).level, "major");
  assert.equal(splitStatus({ level: null, description: null, incidents: [], error: "x" }, NOW).level, null);
});

// ---------------------------------------------------------------- macro

test("growthInflation: GDP against the 2015–19 normal, quarter-average CPI against the target, tail of earlier quarters", () => {
  const db = openDb(":memory:");
  upsertSeries(
    db,
    imfId("NGDP_RPCH", "USA"),
    "imf",
    [2015, 2016, 2017, 2018, 2019].map((y) => ({ ts: Date.UTC(y, 0, 1), value: 2.4 })),
  );
  upsertSeries(db, oecdId("GDP", "USA"), "oecd", [
    { ts: Date.UTC(2026, 3, 1), value: 2.0 },
    { ts: Date.UTC(2026, 6, 1), value: 1.9 },
  ]);
  upsertSeries(db, imfCpiId("USA"), "imfcpi", [
    { ts: Date.UTC(2026, 3, 1), value: 2.6 },
    { ts: Date.UTC(2026, 4, 1), value: 2.8 },
    { ts: Date.UTC(2026, 5, 1), value: 3.0 },
    { ts: Date.UTC(2026, 6, 1), value: 3.5 },
  ]);
  const [us] = growthInflation(db, "en", NOW);
  assert.equal(us.short, "US");
  assert.equal(us.ts, Date.UTC(2026, 6, 1));
  assert.ok(Math.abs(us.growthGap - -0.5) < 1e-9);
  assert.ok(Math.abs(us.inflationGap - 1.5) < 1e-9, "only July is in, so July alone");
  assert.equal(us.trail.length, 1);
  assert.ok(Math.abs(us.trail[0].inflationGap - 0.8) < 1e-9, "Q2 average 2.8 − 2");
});

// ---------------------------------------------------------------- chart layout

test("squarify: areas proportional to values, inside the frame, no overlaps, zero values get no cell", () => {
  const values = [60, 25, 8, 4, 2, 1, 0];
  const frame = { x: 0, y: 0, w: 200, h: 100 };
  const rects = squarify(values, frame);
  assert.equal(rects[6], null);
  const total = values.reduce((a, b) => a + b, 0);
  rects.slice(0, 6).forEach((r, i) => {
    assert.ok(r);
    assert.ok(Math.abs((r.w * r.h) / (frame.w * frame.h) - values[i] / total) < 1e-9, `area ${i}`);
    assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= frame.w + 1e-9 && r.y + r.h <= frame.h + 1e-9, `inside ${i}`);
  });
  const placed = rects.filter((r) => r !== null);
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.ok(overlap < 1e-6, `${i} and ${j} overlap`);
    }
});

test("placeLabels: crowded labels move to a free side or drop out; none overlap", () => {
  const pts = [
    { key: "a", label: "US", cx: 100, cy: 100 },
    { key: "b", label: "EA", cx: 112, cy: 100 },
    { key: "c", label: "UK", cx: 106, cy: 104 },
    { key: "d", label: "BR", cx: 400, cy: 50 },
  ];
  const out = placeLabels(pts, 500, 300);
  assert.deepEqual(out.d, { dx: 8, dy: -6 }, "a lone point keeps the right side");
  const boxes = pts.flatMap((p) => {
    const o = out[p.key];
    return o ? [{ x: p.cx + o.dx, y: p.cy + o.dy, w: p.label.length * 6.4 + 2, h: 12 }] : [];
  });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${i} and ${j} overlap`);
    }
});

// ---------------------------------------------------------------- macro: Fed path priced, US CPI by group

test("Fed path priced: 1-year yield minus the fed funds rate in force, in bp; stale fed funds is skipped", () => {
  const d = (n: number) => Date.UTC(2026, 10, n);
  const dgs1 = [
    { ts: d(2), value: 4.3 },
    { ts: d(3), value: 4.25 },
    { ts: d(20), value: 4.0 },
  ];
  const dff = [
    { ts: d(1), value: 3.88 },
    { ts: d(2), value: 3.88 },
  ];
  assert.deepEqual(spreadBp(dgs1, dff), [
    { ts: d(2), value: 42 },
    { ts: d(3), value: 37 },
  ]);
  assert.ok(FRED_CODES.includes("DFF") && FRED_CODES.includes("DGS1"));

  const db = openDb(":memory:");
  upsertSeries(db, "fred:DGS1", "fred", dgs1);
  upsertSeries(db, "fred:DFF", "fred", dff);
  writeDerived(db);
  const rows = db.prepare("SELECT value FROM observations WHERE series_id = ? ORDER BY ts").all(SERIES.fedPriced.id) as { value: number }[];
  assert.deepEqual(
    rows.map((r) => r.value),
    [42, 37],
  );
  assert.equal(fmtValue(SERIES.fedPriced, -45, "vi"), "−45 bp");
  assert.equal(fmtValue(SERIES.fedPriced, 45, "en"), "+45 bp");
  assert.equal(fmtDelta(SERIES.fedPriced, { value: 45, change: -5, changePct: null, ts: 0, spark: [] }, "en"), "−5 bp");
});

test("US CPI by group: y/y per month for every group, latest with its three-month change", () => {
  for (const p of US_CPI_PARTS) assert.ok(FRED_CODES.includes(p.code), `${p.code} missing from FRED_CODES`);
  const db = openDb(":memory:");
  const m = (y: number, mo: number) => Date.UTC(y, mo - 1, 1);
  // Shelter: index 100 through 2025, then 104 → 4% y/y; three months before the last reading 103 → 3%.
  const shelter = [];
  for (let mo = 1; mo <= 12; mo++) shelter.push({ ts: m(2025, mo), value: 100 });
  for (let mo = 1; mo <= 9; mo++) shelter.push({ ts: m(2026, mo), value: mo === 9 ? 104 : mo === 6 ? 103 : 102 });
  upsertSeries(db, "fred:CUSR0000SAH1", "fred", shelter);
  // Energy: only one year → a single y/y reading, no three-month change.
  upsertSeries(db, "fred:CPIENGSL", "fred", [
    { ts: m(2025, 9), value: 200 },
    { ts: m(2026, 9), value: 190 },
  ]);
  const v = usCpiParts(db, "vi", 24);
  assert.equal(v.rows.length, 9);
  assert.equal(v.rows.at(-1)!.ts, m(2026, 9));
  assert.ok(Math.abs(v.rows.at(-1)!.shelter! - 4) < 1e-9);
  assert.ok(Math.abs(v.rows.at(-1)!.energy! + 5) < 1e-9);
  assert.equal(v.rows[0].energy, null);
  assert.equal(v.rows[0].food, null);
  assert.deepEqual(
    v.last.map((p) => p.key),
    ["energy", "shelter"],
  );
  const shel = v.last.find((p) => p.key === "shelter")!;
  assert.equal(shel.name, "Nhà ở");
  assert.ok(Math.abs(shel.change3! - 1) < 1e-9);
  assert.equal(v.last.find((p) => p.key === "energy")!.change3, null);
});

// ---------------------------------------------------------------- overview: calendar actuals

test("calendar actuals: the period a release covers, the number it reports, printed like the forecast", () => {
  const def = (title: string) => CALENDAR_ACTUALS.find((d) => d.title === title)!;
  // CPI on Tue 10 Nov 2026 covers October; GDP in late October covers Q3; claims on Thu 12 Nov cover the week ending Sat 7 Nov.
  assert.equal(refPeriod("m", Date.UTC(2026, 10, 10, 13, 30)), Date.UTC(2026, 9, 1));
  assert.equal(refPeriod("m", Date.UTC(2027, 0, 13, 13, 30)), Date.UTC(2026, 11, 1));
  assert.equal(refPeriod("q", Date.UTC(2026, 9, 29, 12, 30)), Date.UTC(2026, 6, 1));
  assert.equal(refPeriod("q", Date.UTC(2027, 0, 28, 13, 30)), Date.UTC(2026, 9, 1));
  assert.equal(refPeriod("w", Date.UTC(2026, 10, 12, 13, 30)), Date.UTC(2026, 10, 7));
  assert.equal(refPeriod("w", Date.UTC(2026, 10, 7, 13, 30)), Date.UTC(2026, 9, 31));

  const m = (y: number, mo: number, v: number) => ({ ts: Date.UTC(y, mo - 1, 1), value: v });
  const cpi = [m(2025, 9, 324), m(2026, 8, 334.131), m(2026, 9, 336.298)];
  // The September numbers ForexFactory lists as "previous": CPI m/m 0.6%.
  assert.equal(fmtActual(def("CPI m/m"), actualValue(def("CPI m/m"), cpi, Date.UTC(2026, 8, 1))!), "0.6%");
  assert.equal(fmtActual(def("CPI y/y"), actualValue(def("CPI y/y"), cpi, Date.UTC(2026, 8, 1))!), "3.8%");
  // October not on FRED yet: no actual rather than a stale one.
  assert.equal(actualValue(def("CPI m/m"), cpi, Date.UTC(2026, 9, 1)), null);
  const payems = [m(2026, 9, 159_500), m(2026, 10, 159_687)];
  assert.equal(fmtActual(def("Non-Farm Employment Change"), actualValue(def("Non-Farm Employment Change"), payems, Date.UTC(2026, 9, 1))!), "187K");
  const claims = [{ ts: Date.UTC(2026, 10, 7), value: 201_000 }];
  assert.equal(fmtActual(def("Unemployment Claims"), actualValue(def("Unemployment Claims"), claims, Date.UTC(2026, 10, 7))!), "201K");
  assert.equal(fmtActual(def("CPI m/m"), -0.04), "0.0%");

  assert.equal(parseFigure("0.3%", "%"), 0.3);
  assert.equal(parseFigure("-0.1%", "%"), -0.1);
  assert.equal(parseFigure("194K", "K"), 194);
  assert.equal(parseFigure("194K", "%"), null);
  assert.equal(parseFigure("", "%"), null);
  assert.equal(parseFigure(null, "%"), null);
  // Every title is distinct, so an event maps to one definition.
  assert.equal(new Set(CALENDAR_ACTUALS.map((d) => d.title)).size, CALENDAR_ACTUALS.length);
});

test("calendar actuals from stored FRED data: released US events only, surprise against the forecast", async () => {
  const db = openDb(":memory:");
  upsertSeries(db, "fred:CPIAUCSL", "fred", [
    { ts: Date.UTC(2026, 7, 1), value: 334.131 },
    { ts: Date.UTC(2026, 8, 1), value: 336.298 },
  ]);
  upsertSeries(db, "fred:ICSA", "fred", [{ ts: Date.UTC(2026, 9, 31), value: 189_000 }]);
  const now = Date.UTC(2026, 10, 6, 20);
  const out = await addActuals(
    db,
    [
      { title: "CPI m/m", country: "USD", ts: Date.UTC(2026, 9, 15, 12, 30), forecast: "0.4%" },
      { title: "Unemployment Claims", country: "USD", ts: Date.UTC(2026, 10, 5, 13, 30), forecast: "194K" },
      // Same title elsewhere, or not released yet: left alone.
      { title: "CPI m/m", country: "CAD", ts: Date.UTC(2026, 9, 15, 12, 30), forecast: "0.4%" },
      { title: "CPI m/m", country: "USD", ts: Date.UTC(2026, 10, 10, 13, 30), forecast: "0.3%" },
    ],
    now,
    () => {},
  );
  assert.deepEqual(out.get(0), { actual: "0.6%", surprise: 0.2, polarity: "up-bad" });
  assert.deepEqual(out.get(1), { actual: "189K", surprise: -5, polarity: "up-bad" });
  assert.equal(out.has(2), false);
  assert.equal(out.has(3), false);
});

// ---------------------------------------------------------------- Vietnam: gold premium, the dollar at three prices

test("goldPremiumHistory: the day's last SJC price against world gold in force that day, million VND per tael", () => {
  const db = openDb(":memory:");
  const day = (n: number) => Date.UTC(2026, 10, n);
  // Hanoi is UTC+7: 18:00 UTC on the 2nd is already the 3rd in Hanoi.
  upsertSeries(db, SERIES.sjcGold.id, "sjc", [
    { ts: day(2) + 3 * 3600_000, value: 139_000_000 },
    { ts: day(2) + 9 * 3600_000, value: 140_000_000 },
    { ts: day(2) + 18 * 3600_000, value: 141_000_000 },
  ]);
  upsertSeries(db, SERIES.gold.id, "yahoo", [{ ts: day(2), value: 4000 }]);
  upsertSeries(db, SERIES.usdvnd.id, "yahoo", [{ ts: day(1), value: 25_000 }]);
  const rows = goldPremiumHistory(db, 30, day(4));
  assert.deepEqual(
    rows.map((r) => [r.ts, r.sjc]),
    [
      [day(2), 140],
      [day(3), 141],
    ],
  );
  const world = (4000 * 25_000 * OZ_PER_LUONG) / 1e6;
  assert.ok(Math.abs(rows[0].world! - world) < 1e-9);
  assert.ok(Math.abs(rows[0].premium! - (140 - world)) < 1e-9);
  assert.equal(hanoiDay(day(2) + 18 * 3600_000), day(3));
});

test("dollarHistory: one row per day from the first bank or P2P price, market rate carried over weekends", () => {
  const db = openDb(":memory:");
  const day = (n: number) => Date.UTC(2026, 10, n);
  upsertSeries(db, SERIES.usdvnd.id, "yahoo", [
    { ts: day(1), value: 25_800 },
    { ts: day(4), value: 25_750 },
  ]);
  upsertSeries(db, SERIES.vcbUsd.id, "vcb", [
    { ts: day(2) + 2 * 3600_000, value: 25_990 },
    { ts: day(3) + 2 * 3600_000, value: 25_980 },
  ]);
  upsertSeries(db, SERIES.usdtvnd.id, "binance", [{ ts: day(3), value: 26_100 }]);
  upsertSeries(db, VN_CENTRAL_RATE, "sbvrate", [{ ts: day(3), value: 25_600 }]);
  assert.deepEqual(dollarHistory(db, 30, day(4) + 3600_000), [
    { ts: day(2), market: 25_800, vcb: 25_990, p2p: null, ceiling: null },
    { ts: day(3), market: 25_800, vcb: 25_980, p2p: 26_100, ceiling: 26_880 },
  ]);
  assert.deepEqual(centralBand(db), { ts: day(3), central: 25_600, ceiling: 26_880, floor: 24_320, vcb: 25_980 });
  assert.deepEqual(dollarHistory(openDb(":memory:"), 30, day(4)), []);
});

test("vn30Rows: live price or the reference before the open, market cap from shares, foreign net", () => {
  const rows = vn30Rows(
    [
      { stockSymbol: "FPT", companyNameEn: "FPT Corp", companyNameVi: "FPT", matchedPrice: 50_900, refPrice: 50_000, priceChangePercent: 1.8, nmTotalTradedValue: 1e11, buyForeignValue: 3e10, sellForeignValue: 5e10 },
      { stockSymbol: "VIC", matchedPrice: 0, refPrice: 100_000, priceChangePercent: 0, buyForeignValue: null, sellForeignValue: 1e9 },
      { stockSymbol: "XXX", matchedPrice: null, refPrice: null },
    ],
    { FPT: 1_885_727_648 },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].mcap, 50_900 * 1_885_727_648);
  assert.equal(rows[0].foreignNet, -2e10);
  assert.equal(rows[0].changePct, 1.8);
  assert.deepEqual([rows[1].price, rows[1].changePct, rows[1].mcap, rows[1].foreignNet], [100_000, 0, null, null]);
  assert.equal(rows[1].name.en, "VIC");
});

test("foreignFlows: last sessions oldest first, sums over 5 and 20 sessions and the year", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 10, 9);
  const days = Array.from({ length: 30 }, (_, i) => Date.UTC(2026, 9, 1) + i * DAY);
  upsertSeries(db, VN_FOREIGN.net, "vnflows", [{ ts: Date.UTC(2025, 11, 31), value: 1e12 }, ...days.map((ts, i) => ({ ts, value: (i % 2 ? -1 : 1) * 1e9 * (i + 1) }))]);
  upsertSeries(db, VN_FOREIGN.buy, "vnflows", [{ ts: days.at(-1)!, value: 5e9 }]);
  const f = foreignFlows(db, 10, now)!;
  assert.equal(f.rows.length, 10);
  assert.equal(f.rows.at(-1)!.ts, days.at(-1));
  assert.equal(f.rows.at(-1)!.buy, 5e9);
  assert.equal(f.rows.at(-1)!.sell, null);
  // ±1..±30 bn, odd indices negative; the last five sessions (i = 25..29) are −26, +27, −28, +29, −30.
  assert.equal(f.sum5, (-26 + 27 - 28 + 29 - 30) * 1e9);
  assert.equal(f.ytd, Array.from({ length: 30 }, (_, i) => (i % 2 ? -1 : 1) * (i + 1)).reduce((a, b) => a + b, 0) * 1e9);
  assert.equal(foreignFlows(openDb(":memory:"), 10, now), null);
});

test("centralOf: the State Bank rate from Techcombank's file; empty on weekends; implausible values fail", () => {
  const r = (central?: string) => ({ otherRate: { data: central === undefined ? [] : [{ central }] } });
  assert.equal(centralOf(r("25600")), 25_600);
  assert.equal(centralOf(r("25124.00")), 25_124);
  assert.equal(centralOf(r()), null);
  assert.throws(() => centralOf(r("2.56")));
});

test("lastChange: fuel price against the last different one stored; none until a change is seen", () => {
  assert.equal(lastChange([], 20_890), null);
  assert.equal(lastChange([{ value: 20_890 }, { value: 20_890 }], 20_890), null);
  // Unchanged since the cut from 21,300: still shows that adjustment.
  assert.equal(lastChange([{ value: 21_300 }, { value: 20_890 }, { value: 20_890 }], 20_890), -410);
  assert.equal(lastChange([{ value: 21_300 }, { value: 20_890 }], 21_100), 210);
  assert.equal(lastChange([{ value: 21_300 }, { value: 20_890 }, { value: 20_890 }], 20_500), -390);
});

test("parseRecap: interbank VND rates from Thời báo Ngân hàng's daily sentence; the year that puts the date in the past", () => {
  const text =
    "Trên thị trường liên ngân hàng, tỷ giá đô-đồng chốt phiên với mức 25.547 VND/USD. Thị trường tiền tệ liên ngân hàng ngày 09/11, lãi suất bình quân liên ngân hàng VND giảm 0,05 – 1,60 điểm phần trăm ở các kỳ hạn ngắn trong khi tăng 0,02 điểm phần trăm ở kỳ hạn 1 tháng so với phiên cuối tuần trước, giao dịch tại: qua đêm 4,60%; 1 tuần 4,95%; 2 tuần 5,10% và 1 tháng 5,50%. Lãi suất bình quân liên ngân hàng USD tăng 0,01 điểm phần trăm, qua đêm 3,85%; 1 tuần 3,90%; 2 tuần 3,92%, 1 tháng 4,03. Lợi suất TPCP trên thị trường thứ cấp không thay đổi ở hầu hết các kỳ hạn ngoại trừ giảm nhẹ ở các kỳ hạn 7 năm và 10 năm, chốt phiên ở mức: 3 năm 3,72%; 5 năm 4,28%; 7 năm 4,34%; 10 năm 4,47%; 15 năm 4,57%.";
  assert.deepEqual(parseRecap(text, Date.UTC(2026, 10, 10, 2)), { ts: Date.UTC(2026, 10, 9), on: 4.6, w1: 4.95, w2: 5.1, m1: 5.5, y10: 4.47 });
  // The other wording seen in October.
  assert.equal(parseRecap(text.replace("Lợi suất TPCP trên", "Lợi suất trái phiếu chính phủ trên").replace("chốt phiên ở mức:", "chốt phiên:"), Date.UTC(2026, 10, 10))!.y10, 4.47);
  assert.equal(parseRecap(text.slice(0, text.indexOf("Lợi suất TPCP")), Date.UTC(2026, 10, 10))!.y10, null);
  // A late-December recap read in early January belongs to the year before.
  assert.equal(parseRecap(text.replace("ngày 09/11", "ngày 30/12"), Date.UTC(2027, 0, 2))!.ts, Date.UTC(2026, 11, 30));
  assert.equal(parseRecap("Điểm lại tuần từ 3/11 đến 7/11: thanh khoản dồi dào."), null);
  assert.throws(() => parseRecap(text.replace("qua đêm 4,60%", "qua đêm 46,0%")));
  assert.deepEqual(
    recapLinks('<a href="https://thoibaonganhang.vn/diem-lai-thong-tin-kinh-te-ngay-911-190427-190427.html">x</a><a href="https://thoibaonganhang.vn/diem-lai-thong-tin-kinh-te-ngay-911-190427-190427.html">y</a><a href="https://thoibaonganhang.vn/other.html">z</a>'),
    ["https://thoibaonganhang.vn/diem-lai-thong-tin-kinh-te-ngay-911-190427-190427.html"],
  );
});

test("messages: no key repeated within an object (JSON keeps the last one silently)", () => {
  for (const lang of ["en", "vi"]) {
    const text = readFileSync(`messages/${lang}.json`, "utf8");
    // Track keys per nesting level: a duplicate is the same key twice before its object closes.
    const stack: Set<string>[] = [];
    const dups: string[] = [];
    for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:|[{}]|"(?:[^"\\]|\\.)*"/g)) {
      if (m[0] === "{") stack.push(new Set());
      else if (m[0] === "}") stack.pop();
      else if (m[1] !== undefined) {
        const keys = stack[stack.length - 1];
        if (keys.has(m[1])) dups.push(m[1]);
        keys.add(m[1]);
      }
    }
    assert.deepEqual(dups, [], `${lang}.json repeats ${dups.join(", ")}`);
  }
});

// ---------------------------------------------------------------- crypto: leverage, chains

test("dailyFundingApr: the day's average funding rate, annualized from 8-hour periods", () => {
  const d = Date.UTC(2026, 10, 9);
  assert.deepEqual(
    dailyFundingApr([
      { fundingRate: "0.0001", fundingTime: d },
      { fundingRate: "0.0002", fundingTime: d + 8 * 3600_000 },
      { fundingRate: "0.0003", fundingTime: d + 16 * 3600_000 },
      { fundingRate: "-0.0001", fundingTime: d + DAY + 1 },
    ]).map((p) => [p.ts, Number(p.value.toFixed(4))]),
    [
      [d, 21.9],
      [d + DAY, -10.95],
    ],
  );
});

test("tvlChange: TVL now against the last day at least N days back", () => {
  const day = 86_400;
  const h = [0, 1, 2, 7, 8].map((i) => ({ date: 1_700_000_000 + i * day, tvl: 100 + i * 10 }));
  // Last = day 8 (180); 7 days back = day 1 (110).
  assert.ok(Math.abs(tvlChange(h, 7)! - (180 / 110 - 1) * 100) < 1e-9);
  assert.equal(tvlChange(h, 30), null);
  assert.equal(tvlChange([], 7), null);
});

test("btcLeverage: open interest and price rebased to the first day; funding and long/short with their averages", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 10, 9);
  const day = (n: number) => Date.UTC(2026, 10, n);
  upsertSeries(db, BTC_HISTORY.oi, "binance", [
    { ts: day(8), value: 90_000 },
    { ts: day(9), value: 99_000 },
  ]);
  upsertSeries(db, SERIES.btc.id, "yahoo", [
    { ts: day(8), value: 80_000 },
    { ts: day(9), value: 76_000 },
  ]);
  upsertSeries(db, BTC_HISTORY.lsr, "binance", [
    { ts: day(8), value: 2 },
    { ts: day(9), value: 3 },
  ]);
  upsertSeries(db, BTC_HISTORY.funding, "binance", [{ ts: day(9), value: 11 }]);
  const lev = btcLeverage(db, 90, now)!;
  assert.deepEqual(lev.rows, [
    { ts: day(8), oi: 100, price: 100 },
    { ts: day(9), oi: 110.00000000000001, price: 95 },
  ]);
  assert.ok(Math.abs(lev.oiChange! - 10) < 1e-9);
  assert.equal(lev.priceChange, -5);
  assert.deepEqual(lev.lsr, { last: 3, avg: 2.5 });
  assert.deepEqual(lev.funding, { last: 11, avg: 11 });
  assert.equal(btcLeverage(openDb(":memory:"), 90, now), null);
});

test("parseEtfTable: dated rows per fund and total; summary rows skipped; a changed header fails", () => {
  const rows = [
    ["Date", "IBIT", "FBTC", "Totals"],
    ["Nov 06, 2026", "-397.3", "42.2", "-355.1"],
    ["Nov 05, 2026", "1,117.0", "-0.0", "1,117.0"],
    ["Total", "719.7", "42.2", "761.9"],
    ["Maximum", "1,117.0", "42.2", "1,117.0"],
  ];
  assert.deepEqual(parseEtfTable(rows), [
    { ts: Date.UTC(2026, 10, 6), funds: { IBIT: -397.3, FBTC: 42.2 }, total: -355.1 },
    { ts: Date.UTC(2026, 10, 5), funds: { IBIT: 1117, FBTC: -0 }, total: 1117 },
  ]);
  assert.throws(() => parseEtfTable([["Date", "IBIT", "Sum"]]));
  assert.throws(() => parseEtfTable([rows[0], ["Nov 04, 2026", "n/a", "1", "1"]]));
});

test("etfFlows: daily totals oldest first, the latest day by fund, 5-day and window sums", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 10, 9);
  const days = [3, 4, 5, 6, 9].map((n) => Date.UTC(2026, 10, n));
  upsertSeries(db, BTC_ETF.total, "etfflows", days.map((ts, i) => ({ ts, value: (i + 1) * 100 })));
  upsertSeries(db, `${BTC_ETF.prefix}IBIT`, "etfflows", [{ ts: days[4], value: 300 }]);
  upsertSeries(db, `${BTC_ETF.prefix}FBTC`, "etfflows", [{ ts: days[3], value: 50 }]);
  const f = etfFlows(db, 4, now)!;
  assert.deepEqual(
    f.rows.map((r) => r.total),
    [200, 300, 400, 500],
  );
  assert.deepEqual(f.latest, { ts: days[4], total: 500, funds: [{ fund: "IBIT", value: 300 }] });
  assert.equal(f.sum5, 1400);
  assert.equal(f.sumAll, 1400);
  assert.equal(etfFlows(openDb(":memory:"), 4, now), null);
});

// ---------------------------------------------------------------- news: one row per story

test("clusterStories: headlines of one story fold into the newest, keeping outlets, photo and the folded titles", () => {
  const item = (id: string, title: string, source: string, image: string | null = null) => ({ id, url: `https://x/${id}`, source, title, image, alsoIn: [] as string[], related: [] as { title: string; source: string; url: string }[] });
  const items = [
    item("1", "Trump defends Nvidia's Huang after calling about spy scandal", "Al Jazeera"),
    item("2", "Australia to introduce mandatory AI safeguards", "DW"),
    item("3", "Everything we know so far about the Nvidia spy scandal targeting CEO Jensen Huang", "The Verge", "https://img/3.jpg"),
    item("4", "France blames Iran for cyberattack on supermarket fridges", "France 24"),
    item("5", "Iran was behind cyber-attack on French supermarket freezers, Paris says", "The Guardian"),
    item("6", "France blames Iran for October supermarket cyberattack", "Al Jazeera"),
    item("7", "Google takes aim at Nvidia with new AI chips", "Decrypt"),
    item("8", "Otter AI can now follow conversations across 30 languages", "TechCrunch"),
  ];
  const out = clusterStories(items, "en");
  assert.deepEqual(
    out.map((s) => [s.id, s.related.map((r) => r.url.slice(-1))]),
    [
      ["1", ["3"]],
      ["2", []],
      ["4", ["6"]],
      ["5", []],
      ["7", []],
      ["8", []],
    ],
  );
  assert.equal(out[0].image, "https://img/3.jpg");
  assert.deepEqual(out[0].alsoIn, ["The Verge"]);
  assert.deepEqual(out[2].alsoIn, ["Al Jazeera"]);
  // The input is left as it was.
  assert.deepEqual(items[0].related, []);
  assert.deepEqual(titleWords("Nvidia’s CEO says the chips are coming", "en"), ["nvidia", "ceo", "chip", "coming"]);
  assert.deepEqual(titleWords("Pháp cáo buộc Iran đứng sau vụ tấn công", "vi"), ["pháp", "cáo", "buộc", "iran", "đứng", "vụ", "tấn", "công"]);
});

// ---------------------------------------------------------------- tech: Taiwan revenue, hiring, end of life

test("twRevenueRows: tracked companies only, ROC month, NT$ thousand → billion, comparisons as reported", () => {
  assert.equal(rocMonth("11509"), Date.UTC(2026, 8, 1));
  assert.equal(rocMonth("9912"), Date.UTC(2010, 11, 1));
  assert.throws(() => rocMonth("2026-09"));
  const rows = twRevenueRows([
    { 資料年月: "11509", 公司代號: "2330", "營業收入-當月營收": "511857399", "營業收入-上月比較增減(%)": "-0.57", "營業收入-去年同月增減(%)": "54.6", "累計營業收入-前期比較增減(%)": "41.1" },
    { 資料年月: "11509", 公司代號: "9999", "營業收入-當月營收": "1" },
    { 資料年月: "11508", 公司代號: "2454", "營業收入-當月營收": "55399497", "營業收入-上月比較增減(%)": "", "營業收入-去年同月增減(%)": null },
  ]);
  assert.deepEqual(rows, [
    { code: "2330", month: Date.UTC(2026, 8, 1), revenue: 511.857399, mom: -0.57, yoy: 54.6, ytdYoy: 41.1 },
    { code: "2454", month: Date.UTC(2026, 7, 1), revenue: 55.399497, mom: null, yoy: null, ytdYoy: null },
  ]);
  assert.throws(() => twRevenueRows([{ 資料年月: "11509", 公司代號: "2330", "營業收入-當月營收": "0" }]));
});

test("hiringMonth: only the monthly 'Who is hiring?' thread, by its month", () => {
  assert.equal(hiringMonth("Ask HN: Who is hiring? (November 2026)"), Date.UTC(2026, 10, 1));
  assert.equal(hiringMonth("Ask HN: Who wants to be hired? (November 2026)"), null);
  assert.equal(hiringMonth("Ask HN: Freelancer? Seeking freelancer? (November 2026)"), null);
});

test("eolRow: newest line, and the soonest end of life among lines still supported", () => {
  const now = Date.UTC(2026, 10, 10);
  const row = eolRow(
    "Node.js",
    [
      { cycle: "26", releaseDate: "2026-05-05", eol: "2029-04-30", latest: "26.13.0", latestReleaseDate: "2026-10-28" },
      { cycle: "25", releaseDate: "2025-10-15", eol: "2026-06-01", latest: "25.9.0" },
      { cycle: "24", eol: "2028-04-30" },
      { cycle: "22", eol: "2027-04-30" },
    ],
    now,
  )!;
  assert.deepEqual(row, {
    name: "Node.js",
    cycle: "26",
    latest: "26.13.0",
    latestDate: Date.UTC(2026, 9, 28),
    eol: Date.UTC(2029, 3, 30),
    nextEol: { cycle: "22", date: Date.UTC(2027, 3, 30) },
  });
  assert.equal(eolRow("React", [{ cycle: 19, eol: false, latest: "19.3.1" }], now)!.nextEol, null);
  assert.equal(eolRow("X", [], now), null);
});

test("techInput: the week's stories one per story, biggest first; old incidents and stale models left out", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 10, 9);
  const ins = db.prepare("INSERT INTO articles (id, url, source, lang, topic, title, title_key, published_at, fetched_at) VALUES (?, ?, ?, 'en', 'tech', ?, ?, ?, ?)");
  const titles = [
    ["The Verge", "Everything we know about the Nvidia spy scandal targeting CEO Jensen Huang"],
    ["TechCrunch", "Nvidia spy scandal: Jensen Huang faces questions"],
    ["Ars Technica", "Trump defends Nvidia's Jensen Huang over spy scandal"],
    ["TechCrunch", "Otter AI can now follow conversations across 30 languages"],
    ["The Verge", "A story from two weeks ago"],
  ];
  titles.forEach(([source, title], i) => ins.run(String(i), `https://x/${i}`, source, title, title.toLowerCase(), now - (i === 4 ? 14 : 1) * DAY - i * 3600_000, now));
  replaceItems(db, "status", [
    { id: "aws", title: "AWS", data: { level: "major", description: null, incidents: [{ title: "Region outage", impact: "major", status: null, since: now - 200 * DAY, where: null, url: null }] } },
    { id: "cf", title: "Cloudflare", data: { level: "minor", description: null, incidents: [{ title: "Purge delays", impact: "minor", status: null, since: now - DAY, where: null, url: null }] } },
  ]);
  replaceItems(db, "ai_models", [
    { id: "new", title: "new", data: { provider: "Anthropic", name: "Claude Fable 5.2", created: now - DAY, context: 1_000_000, priceIn: 8, priceOut: 40, open: false, inputs: [], outputs: [] } },
    { id: "old", title: "old", data: { provider: "X", name: "Old", created: now - 20 * DAY, context: null, priceIn: 1, priceOut: 1, open: false, inputs: [], outputs: [] } },
  ]);
  const { input, stories } = techInput(db, now);
  assert.equal(stories, 2);
  assert.match(input.topStories[0], /\[3 articles, 3 outlets\]$/);
  assert.match(input.topStories[1], /^Otter AI/);
  assert.deepEqual(input.openIncidents, ["Cloudflare: Purge delays (minor, since 2026-11-09)"]);
  assert.deepEqual(input.newAiModels, ["Anthropic Claude Fable 5.2: $8 in / $40 out per M tokens, 1000K context"]);
});

test("parseFredCalendar: dated rows then release times, US Central to UTC across daylight saving", () => {
  const html = `<table><thead><tr><th>Sort By: Date | Name</th></tr></thead><tbody>
    <tr class="odd"><td colspan="2"><span style="font-weight: bold;">Tuesday November 10, 2026</span></td></tr>
    <tr><td> 7:30 am </td><td><a href="/release?rid=10">Consumer Price Index</a></td></tr>
    <tr class="odd"><td colspan="2"><span>Friday July 10, 2026</span></td></tr>
    <tr><td> 7:30 am </td><td><a href="/release?rid=10">Consumer Price Index</a></td></tr>
    <tr><td> 12:00 pm </td><td><a href="/release?rid=21">H.6 Money Stock Measures</a></td></tr>
    <tr><td>Releases 1 - 3 of 3</td></tr></tbody></table>`;
  assert.deepEqual(parseFredCalendar(html), [Date.UTC(2026, 10, 10, 13, 30), Date.UTC(2026, 6, 10, 12, 30), Date.UTC(2026, 6, 10, 17, 0)]);
  assert.deepEqual(parseFredCalendar("<p>maintenance</p>"), []);
});

// ---------------------------------------------------------------- tech: AI model quality against price

test("joinArena: arena names to OpenRouter models by organisation and name, best variant, paid only", () => {
  assert.equal(modelKey("Qwen3.8-Max-Preview (0902)"), "qwen3.8 max");
  assert.equal(modelKey("Claude Opus 5 (Max)"), "claude opus 5");
  assert.equal(modelKey("qwen3.8-max-0902"), "qwen3.8 max");
  const row = (model_name: string, organization: string, rating: number, rank: number, category = "overall") => ({ row: { model_name, organization, rating, rank, category, leaderboard_publish_date: "2026-11-09" } });
  const out = joinArena(
    [
      row("Claude Opus 5 (Max)", "anthropic", 1506, 5),
      row("Claude Opus 5 (High)", "anthropic", 1502, 7),
      row("Qwen3.8-Max", "alibaba", 1480, 20),
      row("Free Model", "acme", 1400, 50),
      row("Not Sold", "acme", 1450, 30),
      row("Claude Opus 5", "anthropic", 1600, 1, "coding"),
    ],
    [
      { id: "anthropic/claude-opus-5", name: "Anthropic: Claude Opus 5", pricing: { prompt: "0.000005", completion: "0.000025" } },
      { id: "anthropic/claude-opus-5:thinking", name: "Anthropic: Claude Opus 5 (thinking)", pricing: { prompt: "0.000005", completion: "0.000025" } },
      { id: "qwen/qwen3.8-max-0902", name: "Qwen: Qwen3.8 Max", pricing: { prompt: "0.0000012", completion: "0.000006" }, hugging_face_id: null },
      { id: "acme/free-model", name: "Acme: Free Model", pricing: { prompt: "0", completion: "0" } },
    ],
  );
  assert.deepEqual(
    out.map((r) => [r.id, r.rating, r.rank, r.priceIn, r.priceOut, r.blended]),
    [
      ["anthropic/claude-opus-5", 1506, 5, 5, 25, 10],
      ["qwen/qwen3.8-max-0902", 1480, 20, 1.2, 6, 2.4],
    ],
  );
});

test("logAxis: ends at the nearest 1 or 3 × 10ⁿ past the data, ticks at 1 and 3 × 10ⁿ", () => {
  const a = logAxis([0.13, 2, 20], 3);
  assert.deepEqual([10 ** a.lo, 10 ** a.hi].map((v) => Number(v.toPrecision(3))), [0.1, 30]);
  assert.deepEqual(a.ticks.map((v) => Number(v.toPrecision(3))), [0.1, 0.3, 1, 3, 10, 30]);
  const b = logAxis([0.5, 0.8], 0.7);
  assert.deepEqual([10 ** b.lo, 10 ** b.hi].map((v) => Number(v.toPrecision(3))), [0.3, 1.0]);
});

test("kpPoints: NOAA's 3-hour Kp rows as UTC points, observed / estimated / predicted, gaps dropped", () => {
  assert.deepEqual(
    kpPoints([
      { time_tag: "2026-11-10T00:00:00", kp: 3, observed: "observed", noaa_scale: null },
      { time_tag: "2026-11-10T03:00:00", kp: 5.33, observed: "estimated", noaa_scale: "G1" },
      { time_tag: "2026-11-10T06:00:00", kp: null, observed: "predicted", noaa_scale: null },
      { time_tag: "2026-11-12T21:00:00", kp: 2, observed: "predicted", noaa_scale: null },
    ]),
    [
      { ts: Date.UTC(2026, 10, 10, 0), kp: 3, kind: "observed" },
      { ts: Date.UTC(2026, 10, 10, 3), kp: 5.33, kind: "estimated" },
      { ts: Date.UTC(2026, 10, 12, 21), kp: 2, kind: "predicted" },
    ],
  );
});

test("weeklyTotals: Monday-to-Sunday sums, complete weeks only, the running week left out", () => {
  // 2 Nov 2026 is a Monday.
  const days = Array.from({ length: 17 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10), downloads: 10 + i }));
  const weeks = weeklyTotals(days, Date.UTC(2026, 10, 17, 12));
  // Sun 1 Nov is the tail of an incomplete week; 2–8 and 9–15 are whole; 16–17 is still running.
  assert.deepEqual(weeks, [
    { ts: Date.UTC(2026, 10, 2), value: [11, 12, 13, 14, 15, 16, 17].reduce((a, b) => a + b, 0) },
    { ts: Date.UTC(2026, 10, 9), value: [18, 19, 20, 21, 22, 23, 24].reduce((a, b) => a + b, 0) },
  ]);
});

test("packageRows: last week and its change against 4 and 12 weeks earlier, config order", () => {
  const db = openDb(":memory:");
  const react = PACKAGES[0];
  upsertSeries(db, pkgId(react), "pkgtrends", Array.from({ length: 13 }, (_, i) => ({ ts: Date.UTC(2026, 7, 3) + i * 7 * DAY, value: 100 + i * 10 })));
  const rows = packageRows(db);
  assert.equal(rows.length, PACKAGES.length);
  assert.equal(rows[0].name, "react");
  assert.equal(rows[0].week, 220);
  assert.ok(Math.abs(rows[0].ch4! - (220 / 180 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(rows[0].ch12! - (220 / 100 - 1) * 100) < 1e-9);
  assert.equal(rows[1].week, null);
});

test("epoch: models with a compute figure, the frontier at each release, growth per year", () => {
  const rows = [
    ["Model", "Organization", "Publication date", "Domain", "Training compute (FLOP)"],
    ["A", "Lab One, Lab Two", "2020-01-01", "Language", "1e22"],
    ["B", "Lab", "2021-01-01", "Language,Vision", "1e23"],
    ["No compute", "Lab", "2021-06-01", "Language", ""],
    ["Bad date", "Lab", "soon", "Language", "1e24"],
    ["C", "Lab", "2022-01-01", "Language", "5e22"],
  ];
  const models = computeModels(rows);
  assert.deepEqual(
    models.map((m) => [m.model, m.org, m.domain, m.flop]),
    [
      ["A", "Lab One", "Language", 1e22],
      ["B", "Lab", "Language", 1e23],
      ["C", "Lab", "Language", 5e22],
    ],
  );
  assert.throws(() => computeModels([["Name", "Date"]]));
  // Top 1 at release: A sets it, B beats it, C does not.
  assert.deepEqual(
    frontier(models, 1).map((m) => m.model),
    ["A", "B"],
  );
  // Ten times a year, exactly.
  const year = 365.25 * 24 * 3600_000;
  const pts = Array.from({ length: 6 }, (_, i) => ({ date: Date.UTC(2020, 0, 1) + i * year, flop: 1e20 * 10 ** i }));
  assert.ok(Math.abs(growthPerYear(pts)! - 10) < 1e-6);
  assert.equal(growthPerYear(pts.slice(0, 4)), null);
});
