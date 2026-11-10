import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { ASSET_CLASSES, COMMODITIES, MARKET_EXTRA_SYMBOLS } from "@/config/markets";
import { YAHOO_SYMBOLS } from "@/config/series";
import { imfCpiId, imfId, oecdId } from "@/config/macro";
import { replaceEvents, upsertQuotes, upsertSeries } from "@/lib/sources/store";
import { kevByVendor } from "@/lib/sources/kev";
import type { ServiceStatus } from "@/lib/sources/cloudstatus";
import { assetClassRows, commodityRows, ratioSeries, spreadHistory, spreadRun } from "@/lib/data/markets";
import { nthWeekday, vnHazards, vnMarketDates, vnRatesHistory } from "@/lib/data/vietnam";
import { splitStatus } from "@/lib/data/tech";
import { growthInflation } from "@/lib/data/macro";
import { squarify } from "@/lib/treemap";
import { placeLabels } from "@/components/charts/QuadrantScatter";

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
