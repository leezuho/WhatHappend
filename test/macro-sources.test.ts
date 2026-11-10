import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { SBV_CHECKED, SBV_RECHECK_DAYS, SBV_REFI_STEPS } from "@/config/policy-rates";
import { freshest } from "@/lib/data/series";
import { parseCnbcBars } from "@/lib/sources/cnbc";
import { parseSidra } from "@/lib/sources/ibge";
import { MACRO_COUNTRIES } from "@/config/countries";
import { uneIds, uneRise } from "@/lib/data/macro";
import { unemploymentRise, unemploymentRiseYoy, unemploymentStatus } from "@/lib/signals/macro";
import { htmlText, tableRows, viNumber } from "@/lib/sources/http";
import { parseImfCpiCsv } from "@/lib/sources/imfcpi";
import { periodTs } from "@/lib/sources/oecd";
import { expandSteps } from "@/lib/sources/sbv";
import { upsertSeries } from "@/lib/sources/store";
import { gdpGrowth } from "@/lib/sources/worldbank";

// Sources that fill the gaps OECD and BIS leave on the macro page (Vietnam, and
// stopped OECD series elsewhere): IMF CPI, World Bank GEM, CNBC, SBV rates.

const month = (y: number, m: number) => Date.UTC(y, m - 1, 1);
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("periodTs: IMF monthly periods (2026-M09) next to OECD's", () => {
  assert.equal(periodTs("2026-M09"), month(2026, 9));
  assert.equal(periodTs("2026-09"), month(2026, 9));
  assert.equal(periodTs("2026-M13x"), null);
});

test("IMF CPI CSV: national CPI over HICP, HICP where it is all there is, empty values skipped", () => {
  const csv = [
    "DATAFLOW,COUNTRY,INDEX_TYPE,COICOP_1999,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE,SCALE",
    "IMF.STA:CPI(5.0.0),DEU,HICP,_T,YOY_PCH_PA_PT,M,2026-M09,2.9,",
    "IMF.STA:CPI(5.0.0),DEU,CPI,_T,YOY_PCH_PA_PT,M,2026-M09,3.26,",
    "IMF.STA:CPI(5.0.0),DEU,CPI,_T,YOY_PCH_PA_PT,M,2026-M08,2.86,",
    "IMF.STA:CPI(5.0.0),G163,HICP,_T,YOY_PCH_PA_PT,M,2026-M09,3.78,",
    "IMF.STA:CPI(5.0.0),VNM,CPI,_T,YOY_PCH_PA_PT,M,2026-M09,5.08,",
    "IMF.STA:CPI(5.0.0),VNM,CPI,_T,YOY_PCH_PA_PT,M,2026-M10,,",
  ].join("\n");
  const out = parseImfCpiCsv(csv);
  assert.deepEqual(out.get("DEU"), [
    { ts: month(2026, 8), value: 2.86 },
    { ts: month(2026, 9), value: 3.26 },
  ]);
  assert.deepEqual(out.get("G163"), [{ ts: month(2026, 9), value: 3.78 }]);
  assert.deepEqual(out.get("VNM"), [{ ts: month(2026, 9), value: 5.08 }]);
  assert.throws(() => parseImfCpiCsv("A,B\n1,2\n"), /unexpected IMF CPI header/);
});

test("World Bank GEM: growth over the same quarter a year earlier, quarters without a base skipped", () => {
  const row = (date: string, value: number | null) => ({ country: { id: "VNM" }, date, value });
  const pts = gdpGrowth([row("2026Q2", 108.3), row("2025Q2", 100), row("2026Q1", 50), row("2025Q1", null), row("bad", 1)]);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].ts, month(2026, 4));
  close(pts[0].value, 8.3);
});

test("IBGE SIDRA: header row skipped, rolling quarters at their last month, no-data markers dropped", () => {
  const header = { V: "Valor", D3C: "Trimestre Móvel (Código)" };
  const pts = parseSidra([header, { V: "5.3", D3C: "202608" }, { V: "...", D3C: "202610" }, { V: "5.6", D3C: "202605" }, { V: "-", D3C: "202606" }, { V: "5.2", D3C: "202609" }]);
  assert.deepEqual(pts, [
    { ts: month(2026, 5), value: 5.6 },
    { ts: month(2026, 8), value: 5.3 },
    { ts: month(2026, 9), value: 5.2 },
  ]);
});

test("unemployment: Brazil reads IBGE, OECD members keep OECD's series", () => {
  const br = MACRO_COUNTRIES.find((c) => c.imf === "BRA")!;
  const us = MACRO_COUNTRIES.find((c) => c.imf === "USA")!;
  const db = openDb(":memory:");
  upsertSeries(db, "ibge:UNE:BRA", "ibge", [{ ts: month(2026, 9), value: 5.2 }]);
  assert.equal(freshest(db, uneIds(br))?.id, "ibge:UNE:BRA");
  assert.deepEqual(uneIds(us).filter(Boolean), ["oecd:UNE:USA"]);
});

test("unemployment colour: Brazil's unadjusted rate against the same month a year earlier, not the 12-month low", () => {
  const br = MACRO_COUNTRIES.find((c) => c.imf === "BRA")!;
  // IBGE, 2025-03 … 2026-03: the first-quarter jump is seasonal, the rate is lower than a year before.
  const values = [7.0, 6.6, 6.2, 5.8, 5.6, 5.6, 5.6, 5.4, 5.2, 5.1, 5.4, 5.8, 6.1];
  const pts = values.map((value, i) => ({ ts: month(2025, 3 + i), value }));
  close(unemploymentRise(pts)!, 1.0);
  close(uneRise(br, "ibge:UNE:BRA", pts)!, -0.9);
  assert.equal(unemploymentStatus(uneRise(br, "ibge:UNE:BRA", pts)), null);
  // An OECD-style adjusted series for the same country would keep the Sahm rule.
  close(uneRise(br, "oecd:UNE:BRA", pts)!, 1.0);
  // No reading a year back: no colour.
  assert.equal(unemploymentRiseYoy(pts.slice(1)), null);
});

test("CNBC bars: close per trade date, sorted, junk dropped", () => {
  assert.deepEqual(
    parseCnbcBars([
      { close: "7.6920", tradeTime: "20261106000000" },
      { close: "7.7400", tradeTime: "20261105000000" },
      { close: "", tradeTime: "20261104000000" },
      { close: "x", tradeTime: "20261103000000" },
    ]),
    [
      { ts: Date.UTC(2026, 10, 5), value: 7.74 },
      { ts: Date.UTC(2026, 10, 6), value: 7.692 },
    ],
  );
});

test("SBV rate steps: one point per day, each step until the next, up to today", () => {
  const steps = [
    { from: "2023-04-03", rate: 5.5, decision: "a" },
    { from: "2023-04-05", rate: 4.5, decision: "b" },
  ];
  const pts = expandSteps(steps, Date.UTC(2023, 3, 7));
  assert.deepEqual(
    pts.map((p) => p.value),
    [5.5, 5.5, 4.5, 4.5, 4.5],
  );
  assert.equal(pts[0].ts, Date.UTC(2023, 3, 3));
  assert.equal(pts.at(-1)!.ts, Date.UTC(2023, 3, 7));
  assert.throws(() => expandSteps([{ from: "2023-13-40", rate: 1, decision: "x" }], Date.now()), /bad date/);
});

test("SBV declaration: steps in order with plausible rates, checked recently enough to run", () => {
  const ts = SBV_REFI_STEPS.map((s) => Date.parse(`${s.from}T00:00:00Z`));
  assert.ok(ts.every((t, i) => Number.isFinite(t) && (i === 0 || t > ts[i - 1])));
  assert.ok(SBV_REFI_STEPS.every((s) => s.rate > 0 && s.rate < 20 && /QĐ-NHNN$/.test(s.decision)));
  const checked = Date.parse(`${SBV_CHECKED}T00:00:00Z`);
  assert.ok(checked >= ts.at(-1)! && checked <= Date.now());
  assert.ok(SBV_RECHECK_DAYS >= 30);
});

test("Vietnamese numbers and scraped tables", () => {
  assert.equal(viNumber("4,500%"), 4.5);
  assert.equal(viNumber("4,50971434545777"), 4.50971434545777);
  assert.equal(viNumber("1.234,5"), 1234.5);
  assert.ok(Number.isNaN(viNumber("n/a")));
  assert.equal(htmlText("Kỳ hạn c&#242;n lại&nbsp;<b>(%)</b>"), "Kỳ hạn còn lại (%)");
  assert.deepEqual(tableRows("<table><tr><th>A</th><th>B</th></tr><tr><td> 10 năm </td><td>4,51</td></tr></table>"), [
    ["A", "B"],
    ["10 năm", "4,51"],
  ]);
});

test("freshest: the series with the newest point wins, ties go to the first, missing ids are skipped", () => {
  const db = openDb(":memory:");
  upsertSeries(db, "oecd:CPI:X", "oecd", [{ ts: month(2025, 12), value: 2 }]);
  upsertSeries(db, "imf:CPI_M:X", "imfcpi", [{ ts: month(2026, 9), value: 3 }]);
  upsertSeries(db, "a", "t", [{ ts: month(2026, 9), value: 1 }]);
  upsertSeries(db, "b", "t", [{ ts: month(2026, 9), value: 2 }]);
  assert.deepEqual(freshest(db, [null, "oecd:CPI:X", "imf:CPI_M:X"], month(2026, 11)), { id: "imf:CPI_M:X", last: { ts: month(2026, 9), value: 3 } });
  assert.equal(freshest(db, ["oecd:CPI:X", "imf:CPI_M:X"], month(2026, 1))!.id, "oecd:CPI:X");
  assert.equal(freshest(db, ["a", "b"], month(2026, 11))!.id, "a");
  assert.equal(freshest(db, [undefined, false, "nope"]), null);
  db.close();
});
