import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { SERIES } from "@/config/series";
import { CNBC_SYMBOLS, COUNTRIES, FX_SYMBOLS, MACRO_COUNTRIES, WB_GDP_AREAS, policyRateId } from "@/config/countries";
import { displayPoints, getDetailPoints, getTile, yoyOf } from "@/lib/data/series";
import { fmtDelta, fmtPeriod, fmtValue } from "@/lib/format";
import { CB_MEETINGS } from "@/config/central-banks";
import { parseBisCsv } from "@/lib/sources/bis";
import { upsertSeries, type Point } from "@/lib/sources/store";
import { parseSdmxCsv, periodTs } from "@/lib/sources/oecd";
import { writeDerived } from "@/lib/sources/fred";
import {
  averageOfYears,
  budgetStatus,
  clockTrail,
  creditGapStatus,
  cpiStatus,
  currencyChange,
  currencyStatus,
  currentAccountStatus,
  cyclePhase,
  debtStatus,
  deviationFromAverage,
  difference,
  gdpStatus,
  globalLiquidity,
  monthlyAverages,
  monthlyLast,
  netLiquidity,
  normCdf,
  recessionProbability,
  unemploymentRise,
  unemploymentStatus,
  valueAt,
} from "@/lib/signals/macro";

const DAY = 24 * 3600_000;
const month = (y: number, m: number) => Date.UTC(y, m - 1, 1);
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ---------------------------------------------------------------- OECD parsing

test("periodTs: months, quarters and years map to the period's first day (UTC)", () => {
  assert.equal(periodTs("2026-09"), month(2026, 9));
  assert.equal(periodTs("2026-Q2"), month(2026, 4));
  assert.equal(periodTs("2026"), month(2026, 1));
  assert.equal(periodTs("2026-W14"), null);
  assert.equal(periodTs(""), null);
});

const SDMX_HEAD = "DATAFLOW,REF_AREA,FREQ,METHODOLOGY,MEASURE,UNIT_MEASURE,EXPENDITURE,ADJUSTMENT,TRANSFORMATION,TIME_PERIOD,OBS_VALUE,OBS_STATUS";
const sdmxRow = (area: string, period: string, value: string, measure = "CPI") =>
  `OECD.SDD.TPS:DSD_PRICES@DF_PRICES_ALL(1.0),${area},M,N,${measure},PA,_T,N,GY,${period},${value},A`;

test("parseSdmxCsv: groups by country, sorts by period, skips blanks", () => {
  const csv = [SDMX_HEAD, sdmxRow("USA", "2026-02", "2.4"), sdmxRow("CHN", "2026-01", "0.2"), sdmxRow("USA", "2026-01", "2.9"), sdmxRow("USA", "2026-03", "")].join("\n");
  const out = parseSdmxCsv(csv);
  assert.deepEqual(out.get("USA"), [
    { ts: month(2026, 1), value: 2.9 },
    { ts: month(2026, 2), value: 2.4 },
  ]);
  assert.deepEqual(out.get("CHN"), [{ ts: month(2026, 1), value: 0.2 }]);
});

test("parseSdmxCsv: a key matching two series for one country fails instead of mixing them", () => {
  const csv = [SDMX_HEAD, sdmxRow("USA", "2026-01", "2.9"), sdmxRow("USA", "2026-01", "3.1", "CPI_CORE")].join("\n");
  assert.throws(() => parseSdmxCsv(csv), /several series for USA/);
});

test("parseSdmxCsv: an unexpected header fails loudly", () => {
  assert.throws(() => parseSdmxCsv("Internal server error"), /unexpected OECD header/);
});

// ---------------------------------------------------------------- derived series

test("normCdf and the NY Fed recession probit", () => {
  close(normCdf(0), 0.5);
  close(normCdf(1.96), 0.975, 1e-4);
  close(normCdf(-1.96), 0.025, 1e-4);
  // A flat curve (spread 0) gives Φ(−0.5333) ≈ 29.7%; a steep one much less, an inverted one more.
  close(recessionProbability(0), 29.69, 0.01);
  assert.ok(recessionProbability(2) < 5);
  assert.ok(recessionProbability(-1) > 50);
});

test("monthlyAverages and valueAt", () => {
  const pts: Point[] = [
    { ts: Date.UTC(2026, 0, 5), value: 1 },
    { ts: Date.UTC(2026, 0, 20), value: 3 },
    { ts: Date.UTC(2026, 1, 2), value: 5 },
  ];
  assert.deepEqual(monthlyAverages(pts), [
    { ts: month(2026, 1), value: 2 },
    { ts: month(2026, 2), value: 5 },
  ]);
  assert.equal(valueAt(pts, Date.UTC(2026, 0, 1)), null);
  assert.equal(valueAt(pts, Date.UTC(2026, 0, 25)), 3);
  assert.equal(valueAt(pts, Date.UTC(2026, 2, 30)), 5);
  assert.equal(valueAt(pts, Date.UTC(2026, 2, 30), 10 * DAY), null);
});

test("globalLiquidity: converts the ECB and BoJ balance sheets to dollars on the Fed's dates", () => {
  const wed = Date.UTC(2026, 9, 28);
  const out = globalLiquidity({
    fed: [{ ts: wed, value: 6_600_000 }],
    ecb: [{ ts: wed - 5 * DAY, value: 6_000_000 }],
    boj: [{ ts: month(2026, 10), value: 6_000_000 }],
    usdPerEur: [{ ts: wed - DAY, value: 1.1 }],
    jpyPerUsd: [{ ts: wed - DAY, value: 150 }],
  });
  // 6.6T + 6.0T × 1.1 + ¥600T / 150 = 6.6 + 6.6 + 4.0 = $17.2T, in $ millions.
  assert.equal(out.length, 1);
  close(out[0].value, 17_200_000, 1e-3);
  // A week with a missing input is skipped rather than understated.
  assert.equal(globalLiquidity({ fed: [{ ts: wed, value: 1 }], ecb: [], boj: [], usdPerEur: [], jpyPerUsd: [] }).length, 0);
});

test("writeDerived stores the liquidity and recession series from FRED inputs", () => {
  const db = openDb(":memory:");
  const wed = Date.UTC(2026, 9, 28);
  upsertSeries(db, "fred:WALCL", "fred", [{ ts: wed, value: 6_600_000 }]);
  upsertSeries(db, "fred:ECBASSETSW", "fred", [{ ts: wed - 5 * DAY, value: 6_000_000 }]);
  upsertSeries(db, "fred:JPNASSETS", "fred", [{ ts: month(2026, 10), value: 6_000_000 }]);
  upsertSeries(db, "fred:DEXUSEU", "fred", [{ ts: wed - DAY, value: 1.1 }]);
  upsertSeries(db, "fred:DEXJPUS", "fred", [{ ts: wed - DAY, value: 150 }]);
  upsertSeries(db, "fred:T10Y3M", "fred", [
    { ts: Date.UTC(2026, 9, 1), value: 0 },
    { ts: Date.UTC(2026, 9, 2), value: 0 },
  ]);
  assert.equal(writeDerived(db), 2);
  const liq = getTile(db, SERIES.globalLiq);
  close(liq!.value, 17_200_000, 1e-3);
  const rec = getTile(db, SERIES.recProb);
  close(rec!.value, 29.69, 0.01);
  assert.equal(rec!.ts, month(2026, 10));
});

// ---------------------------------------------------------------- business cycle clock

test("cyclePhase: the four quadrants", () => {
  assert.equal(cyclePhase(0.5, 0.2), "expansion");
  assert.equal(cyclePhase(0.5, -0.2), "slowdown");
  assert.equal(cyclePhase(-0.5, -0.2), "downturn");
  assert.equal(cyclePhase(-0.5, 0.2), "recovery");
});

test("clockTrail: gap from 100 and 3-month momentum for the last n months", () => {
  const cli = [99.0, 99.2, 99.5, 99.9, 100.2, 100.4].map((value, i) => ({ ts: month(2026, i + 1), value }));
  const trail = clockTrail(cli, 2, 3);
  assert.equal(trail.length, 2);
  close(trail[1].gap, 0.4);
  close(trail[1].momentum, 100.4 - 99.5);
  assert.equal(trail[1].ts, month(2026, 6));
  // Too short for any momentum: nothing to plot.
  assert.deepEqual(clockTrail(cli.slice(0, 3)), []);
});

// ---------------------------------------------------------------- scorecard judgement

test("cpiStatus: judged against each central bank's own target", () => {
  assert.equal(cpiStatus(2.4, 2), "good");
  assert.equal(cpiStatus(3.5, 2), "warn");
  assert.equal(cpiStatus(5.5, 2), "crit");
  assert.equal(cpiStatus(4.6, 4), "good"); // India targets 4%
  assert.equal(cpiStatus(-0.3, 2), "warn"); // deflation
  assert.equal(cpiStatus(0.5, 2), null); // undershoot, not alarming
});

test("gdp, unemployment, currency, debt and current-account rules", () => {
  assert.equal(gdpStatus(-0.2, 2), "crit");
  assert.equal(gdpStatus(4, 6.5), "warn"); // well below an emerging economy's norm
  assert.equal(gdpStatus(1.8, 2), null);

  const une = [4.0, 3.9, 3.8, 3.9, 4.0, 4.2, 4.4].map((value, i) => ({ ts: month(2026, i + 1), value }));
  close(unemploymentRise(une)!, 0.6);
  assert.equal(unemploymentStatus(0.6), "warn");
  assert.equal(unemploymentStatus(1.0), "crit");
  assert.equal(unemploymentStatus(0.2), null);
  assert.equal(unemploymentRise(une.slice(0, 3)), null);

  const yearEnd = Date.UTC(2025, 11, 31);
  // JPY=X quotes yen per dollar: 150 → 165 means the yen lost ~9.1%.
  close(currencyChange([{ ts: yearEnd, value: 150 }], true, yearEnd, 165)!, (150 / 165 - 1) * 100);
  // EURUSD=X quotes dollars per euro: 1.10 → 1.21 means the euro gained 10%.
  close(currencyChange([{ ts: yearEnd, value: 1.1 }], false, yearEnd, 1.21)!, 10);
  assert.equal(currencyChange([], true, yearEnd, 1), null);
  assert.equal(currencyStatus(-6), "warn");
  assert.equal(currencyStatus(-12), "crit");
  assert.equal(currencyStatus(3), null);

  assert.equal(debtStatus(95), "warn");
  assert.equal(debtStatus(230), "crit");
  assert.equal(currentAccountStatus(-4), "warn");
  assert.equal(currentAccountStatus(-6), "crit");
  assert.equal(currentAccountStatus(2), null);

  const annual = [2014, 2015, 2016, 2017, 2018, 2019, 2020].map((y) => ({ ts: Date.UTC(y, 0, 1), value: y === 2020 ? -5 : y - 2014 }));
  close(averageOfYears(annual, 2015, 2019)!, 3);
  assert.equal(averageOfYears(annual, 1990, 1995), null);
});

// ---------------------------------------------------------------- tiles and config

test("annual tiles skip IMF forecasts dated in future years", () => {
  const db = openDb(":memory:");
  upsertSeries(db, SERIES.worldGdp.id, "imf", [
    { ts: Date.UTC(2025, 0, 1), value: 3.3 },
    { ts: Date.UTC(2026, 0, 1), value: 3.1 },
    { ts: Date.UTC(2027, 0, 1), value: 3.4 },
  ]);
  const now = Date.UTC(2026, 10, 9);
  const t = getTile(db, SERIES.worldGdp, now)!;
  assert.equal(t.value, 3.1);
  close(t.change!, -0.2);
  assert.equal(t.ts, Date.UTC(2026, 0, 1));
  assert.equal(t.range, undefined);
  assert.equal(t.spark.length, 2);
  assert.ok(getDetailPoints(db, SERIES.worldGdp, 3650).every((p) => p.ts <= Date.now()));
});

test("monthly tiles keep two years of readings in the sparkline", () => {
  const db = openDb(":memory:");
  const pts = Array.from({ length: 30 }, (_, i) => ({ ts: Date.UTC(2024, 4 + i, 1), value: 100 + i }));
  upsertSeries(db, SERIES.commodities.id, "fred", pts);
  const t = getTile(db, SERIES.commodities, Date.UTC(2026, 10, 9))!;
  assert.equal(t.spark.length, 24);
  assert.equal(t.value, 129);
});

test("fmtPeriod: month, quarter, year and week labels", () => {
  assert.equal(fmtPeriod(month(2026, 9), "m", "vi"), "T9/2026");
  assert.equal(fmtPeriod(month(2026, 9), "m", "en"), "Sep 2026");
  assert.equal(fmtPeriod(month(2026, 9), "m", "en", true), "Sep '26");
  assert.equal(fmtPeriod(month(2026, 4), "q", "vi", true), "Q2/26");
  assert.equal(fmtPeriod(month(2026, 4), "q", "en"), "Q2 2026");
  assert.equal(fmtPeriod(month(2026, 1), "y", "en"), "2026");
});

test("countries: the macro page has 15 economies plus Vietnam, last; the overview keeps its 9", () => {
  assert.equal(MACRO_COUNTRIES.length, 16);
  assert.equal(MACRO_COUNTRIES.at(-1)!.short, "VN");
  assert.equal(COUNTRIES.filter((c) => c.overview).length, 9);
  // Vietnam is the one row OECD and BIS do not cover; its policy rate and quarterly GDP come from elsewhere.
  assert.deepEqual(
    MACRO_COUNTRIES.filter((c) => !c.oecd || !c.bis).map((c) => c.short),
    ["VN"],
  );
  const vn = MACRO_COUNTRIES.at(-1)!;
  assert.equal(policyRateId(vn), "sbv:REFI");
  assert.equal(policyRateId(MACRO_COUNTRIES.find((c) => c.short === "DE")!), "bis:XM");
  assert.deepEqual(WB_GDP_AREAS, ["VNM"]);
  assert.deepEqual(CNBC_SYMBOLS, ["ID10Y-ID"]);
  assert.ok(FX_SYMBOLS.includes("USDVND=X"));
  assert.equal(new Set(FX_SYMBOLS).size, FX_SYMBOLS.length);
  assert.ok(FX_SYMBOLS.includes("EURUSD=X") && FX_SYMBOLS.includes("JPY=X"));
});

// ---------------------------------------------------------------- Phase 2: theme panels

test("yoyOf: % change from the reading stamped a year earlier; gaps are dropped, not shifted", () => {
  const pts = [
    { ts: month(2025, 1), value: 100 },
    { ts: month(2025, 3), value: 100 },
    { ts: month(2026, 1), value: 103 },
    { ts: month(2026, 2), value: 104 },
    { ts: month(2026, 3), value: 102 },
  ];
  const yoy = yoyOf(pts);
  assert.deepEqual(
    yoy.map((p) => p.ts),
    [month(2026, 1), month(2026, 3)],
  );
  close(yoy[0].value, 3);
  close(yoy[1].value, 2);
});

test("displayPoints: diff turns a level into the change per period, scale converts thousands to a count", () => {
  const level = [
    { ts: month(2026, 8), value: 159_000 },
    { ts: month(2026, 9), value: 159_060 },
    { ts: month(2026, 10), value: 159_225 },
  ];
  assert.deepEqual(displayPoints(SERIES.payrolls, level), [
    { ts: month(2026, 9), value: 60_000 },
    { ts: month(2026, 10), value: 165_000 },
  ]);
  assert.deepEqual(displayPoints(SERIES.dxy, level), level);
});

test("transformed tiles and drawer history: CPI index as y/y inflation, payrolls as jobs added", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 9);
  const cpi = Array.from({ length: 36 }, (_, i) => ({ ts: Date.UTC(2023, 10 + i, 1), value: 300 * 1.03 ** (i / 12) }));
  upsertSeries(db, SERIES.cpi.id, "fred", cpi);
  const t = getTile(db, SERIES.cpi, now)!;
  close(t.value, 3, 1e-9);
  assert.equal(t.ts, Date.UTC(2026, 9, 1));
  assert.equal(t.spark.length, 24);
  assert.ok(t.spark.every((p) => Math.abs(p.value - 3) < 1e-9));
  assert.ok(getDetailPoints(db, SERIES.cpi, 3650).every((p) => Math.abs(p.value - 3) < 1e-9));

  upsertSeries(db, SERIES.payrolls.id, "fred", [
    { ts: month(2026, 8), value: 159_000 },
    { ts: month(2026, 9), value: 159_060 },
    { ts: month(2026, 10), value: 159_225 },
  ]);
  const p = getTile(db, SERIES.payrolls, now)!;
  assert.equal(p.value, 165_000);
  assert.equal(p.change, 105_000);
  assert.equal(fmtValue(SERIES.payrolls, p.value, "en"), "165K");
  assert.equal(fmtDelta(SERIES.payrolls, p, "en"), "+105K");
});

test("netLiquidity: Fed ($M) − reverse repo ($B) − Treasury account ($M), in $B on the Fed's dates", () => {
  const wed = Date.UTC(2026, 10, 4);
  const out = netLiquidity({
    fed: [{ ts: wed, value: 6_600_000 }],
    rrp: [{ ts: wed - DAY, value: 100 }],
    tga: [{ ts: wed, value: 850_000 }],
  });
  assert.deepEqual(out, [{ ts: wed, value: 5650 }]);
  // A reverse-repo reading older than a week leaves the week out instead of using stale data.
  assert.deepEqual(netLiquidity({ fed: [{ ts: wed, value: 1 }], rrp: [{ ts: wed - 9 * DAY, value: 1 }], tga: [{ ts: wed, value: 1 }] }), []);
});

test("writeDerived also stores US net liquidity once its inputs exist", () => {
  const db = openDb(":memory:");
  const wed = Date.UTC(2026, 10, 4);
  upsertSeries(db, "fred:WALCL", "fred", [{ ts: wed, value: 6_600_000 }]);
  upsertSeries(db, "fred:RRPONTSYD", "fred", [{ ts: wed, value: 100 }]);
  upsertSeries(db, "fred:WTREGEN", "fred", [{ ts: wed, value: 850_000 }]);
  assert.equal(writeDerived(db), 1);
  assert.equal(getTile(db, SERIES.netLiq)!.value, 5650);
});

test("monthlyLast and difference: month-end policy rate minus that month's CPI", () => {
  const daily = [
    { ts: Date.UTC(2026, 8, 1), value: 4 },
    { ts: Date.UTC(2026, 8, 30), value: 3.75 },
    { ts: Date.UTC(2026, 9, 15), value: 3.5 },
  ];
  const monthly = monthlyLast(daily);
  assert.deepEqual(monthly, [
    { ts: month(2026, 9), value: 3.75 },
    { ts: month(2026, 10), value: 3.5 },
  ]);
  assert.deepEqual(difference(monthly, [{ ts: month(2026, 9), value: 2.75 }]), [{ ts: month(2026, 9), value: 1 }]);
});

test("debt-panel rules: budget deficits, credit gap, real exchange rate vs its average", () => {
  assert.equal(budgetStatus(-2.9), null);
  assert.equal(budgetStatus(-3.5), "warn");
  assert.equal(budgetStatus(-6.5), "crit");
  assert.equal(creditGapStatus(-15), null);
  assert.equal(creditGapStatus(2.5), "warn");
  assert.equal(creditGapStatus(10.5), "crit");
  const flat = Array.from({ length: 119 }, (_, i) => ({ ts: month(2016, 1 + i), value: 100 }));
  close(deviationFromAverage([...flat, { ts: month(2026, 1), value: 112 }])!, (112 / 100.1 - 1) * 100);
  assert.equal(deviationFromAverage(flat.slice(0, 10)), null);
});

test("parseBisCsv: REF_AREA or BORROWERS_CTY, daily, monthly and quarterly periods", () => {
  const eer = parseBisCsv("FREQ,EER_TYPE,EER_BASKET,REF_AREA,TIME_PERIOD,OBS_VALUE\nM,R,B,JP,2026-09,66.61\nM,R,B,JP,2026-08,67.1\nM,R,B,US,2026-09,\n");
  assert.deepEqual(eer.get("JP"), [
    { ts: month(2026, 8), value: 67.1 },
    { ts: month(2026, 9), value: 66.61 },
  ]);
  assert.equal(eer.has("US"), false);
  const gap = parseBisCsv("FREQ,BORROWERS_CTY,TC_BORROWERS,TC_LENDERS,CG_DTYPE,TIME_PERIOD,OBS_VALUE\nQ,CN,P,A,C,2026-Q1,-5.1412\n");
  assert.deepEqual(gap.get("CN"), [{ ts: month(2026, 1), value: -5.1412 }]);
  const pol = parseBisCsv("FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE\nD,XM,2026-11-03,2\n");
  assert.deepEqual(pol.get("XM"), [{ ts: Date.UTC(2026, 10, 3), value: 2 }]);
  assert.throws(() => parseBisCsv("A,B\n1,2\n"), /unexpected BIS header/);
});

test("countries: every macro economy but Vietnam has its own BIS area; euro members are not the euro area's", () => {
  const areas = MACRO_COUNTRIES.flatMap((c) => (c.bisArea ? [c.bisArea] : []));
  assert.equal(areas.length, MACRO_COUNTRIES.length - 1);
  assert.equal(new Set(areas).size, areas.length);
  assert.equal(MACRO_COUNTRIES.find((c) => c.short === "VN")!.bisArea, null);
  assert.equal(MACRO_COUNTRIES.find((c) => c.short === "DE")!.bisArea, "DE");
  assert.equal(MACRO_COUNTRIES.find((c) => c.short === "EA")!.bisArea, "XM");
});

test("central-bank calendar: valid dates, decision day on or after the first day, meetings in order per bank", () => {
  for (const m of CB_MEETINGS) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(m.start) && /^\d{4}-\d{2}-\d{2}$/.test(m.end), `${m.bank} ${m.start}`);
    assert.ok(!Number.isNaN(Date.parse(m.end)) && m.end >= m.start, `${m.bank} ${m.start}–${m.end}`);
    assert.ok(Date.parse(m.end) - Date.parse(m.start) <= 3 * DAY, `${m.bank} ${m.start}–${m.end}`);
  }
  const byBank = Map.groupBy(CB_MEETINGS, (m) => m.bank);
  for (const [bank, list] of byBank) assert.deepEqual(list.map((m) => m.end), [...list.map((m) => m.end)].sort(), bank);
});
