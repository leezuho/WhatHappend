import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { upsertSeries, type Point } from "@/lib/sources/store";
import { frAgency, parseOfacActions } from "@/lib/sources/uspolicy";
import { countryIndices, excelMonth } from "@/lib/sources/gprc";
import { binOf, chokepointRow, gprHeatmap, weeklyMeans } from "@/lib/data/geopolitics";
import { calendarForBrief } from "@/lib/data/calendar";
import { CHOKEPOINTS, GPR_BINS, gprCountryId, policyCountries } from "@/config/geopolitics";
import { ELECTIONS, electionTs } from "@/config/elections";

const DAY = 86_400_000;

test("parseOfacActions: title, date from the slug, categories; same-day suffix kept", () => {
  const row = (slug: string, title: string, cats: string[]) =>
    `<div class="margin-bottom-4 search-result views-row"><div><div class="font-sans-lg"><a href="/recent-actions/${slug}" hreflang="en">${title}</a></div></div>` +
    `<div><div class="margin-top-1">November 09, 2026 - ${cats.map((c) => `<a href="/recent-actions/${c.toLowerCase().replace(/ /g, "-")}">${c}</a>`).join(" ")}</div></div></div>`;
  const html = `<p>Displaying 1 - 10</p>${row("20261109", "Iran Designation Update", ["Sanctions List Updates"])}${row("20261105_2", "Cuba Designations; Publication of Cuba-related Determination &amp; FAQ", ["Sanctions List Updates", "General Licenses"])}`;
  const out = parseOfacActions(html);
  assert.deepEqual(
    out.map((a) => [a.slug, a.title, new Date(a.ts).toISOString().slice(0, 10), a.tags]),
    [
      ["20261109", "Iran Designation Update", "2026-11-09", ["Sanctions List Updates"]],
      ["20261105_2", "Cuba Designations; Publication of Cuba-related Determination & FAQ", "2026-11-05", ["Sanctions List Updates", "General Licenses"]],
    ],
  );
  assert.deepEqual(parseOfacActions("<html>no list</html>"), []);
});

test("frAgency: trade and sanctions decisions kept, paperwork and ceremonial proclamations dropped", () => {
  const doc = (title: string, type: string, slugs: string[]) => ({ title, type, agencies: slugs.map((slug) => ({ slug })) });
  const BIS = "industry-and-security-bureau";
  const USTR = "trade-representative-office-of-united-states";
  const EOP = "executive-office-of-the-president";
  assert.equal(frAgency(doc("Revisions to the Entity List", "Rule", ["commerce-department", BIS])), "bis");
  assert.equal(frAgency(doc("Agency Information Collection Activities; Submission to OMB", "Notice", [BIS])), null);
  assert.equal(frAgency(doc("PJSC Aeroflot; Order Renewing Temporary Denial of Export Privileges", "Notice", [BIS])), null);
  assert.equal(frAgency(doc("Notice of Determination To Extend Section 301 Investigation of Vietnam's Acts", "Notice", [USTR])), "ustr");
  assert.equal(frAgency(doc("Performance Review Board Membership", "Notice", [USTR])), null);
  assert.equal(frAgency(doc("Adjusting Imports of Wind Turbines Into the United States", "Presidential Document", [EOP])), "wh");
  assert.equal(frAgency(doc("Implementing the Lindsey O. Graham Sanctioning Russia and Iran Act of 2026", "Presidential Document", [EOP])), "wh");
  assert.equal(frAgency(doc("National Seafood Month, 2026", "Presidential Document", [EOP])), null);
  assert.equal(frAgency(doc("Continuation of the National Emergency With Respect to Iran", "Presidential Document", [EOP])), null);
  assert.equal(frAgency(doc("Some Treasury rule", "Rule", ["treasury-department"])), null);
});

test("policyCountries: North Korea is not South Korea; Vietnam, the EU and adjectives are caught", () => {
  assert.deepEqual(policyCountries("North Korea Designations; Democratic Republic of the Congo-related Designations"), ["KP"]);
  assert.deepEqual(policyCountries("Agreement Between the United States and the Republic of Korea"), ["KR"]);
  assert.deepEqual(policyCountries("Section 301 Investigation of Vietnam's Acts, Policies, and Practices"), ["VN"]);
  assert.deepEqual(policyCountries("Effect of the European Union's Carbon Border Adjustment Mechanism"), ["EU"]);
  assert.deepEqual(policyCountries("Iran-related Designations; Issuance of Russia-related General License"), ["RU", "IR"]);
  assert.deepEqual(policyCountries("Counter Terrorism Designations"), []);
});

test("excelMonth and countryIndices: each country against its own 1985–2019 mean", () => {
  assert.equal(new Date(excelMonth(46296)).toISOString().slice(0, 10), "2026-10-01");
  // Excel day numbers of 1 Jan 1990, 1 Jan 2000, 1 Jan 2026 and 1 Feb 2026.
  const serial = (y: number, m: number) => (Date.UTC(y, m, 1) - Date.UTC(1899, 11, 30)) / DAY;
  const rows = [
    { month: serial(1990, 0), GPRC_USA: 2, GPRC_VNM: 0.04 },
    { month: serial(2000, 0), GPRC_USA: 4, GPRC_VNM: 0.06, GPRC_TUN: 0 },
    { month: serial(2026, 0), GPRC_USA: 6, GPRC_VNM: 0.1 },
    { month: serial(2026, 1), GPRC_USA: 3, var_name: "x" },
  ];
  const out = countryIndices(rows, Date.UTC(2015, 0, 1));
  assert.deepEqual(out.get("USA"), [
    { ts: Date.UTC(2026, 0, 1), value: 200 },
    { ts: Date.UTC(2026, 1, 1), value: 100 },
  ]);
  assert.deepEqual(out.get("VNM")?.map((p) => Math.round(p.value)), [200]);
  // A base of zero cannot be an index.
  assert.equal(out.has("TUN"), false);
});

test("chokepointRow: 7-day average vs the same week a year earlier, a shut strait flagged", () => {
  const end = Date.UTC(2026, 10, 8);
  const total: Point[] = [];
  const tankers: Point[] = [];
  for (let ts = end - 500 * DAY; ts <= end; ts += DAY) {
    const shut = ts > end - 7 * DAY;
    total.push({ ts, value: shut ? 4 : 100 });
    tankers.push({ ts, value: shut ? 1 : 50 });
  }
  const r = chokepointRow(CHOKEPOINTS[0], total, tankers);
  assert.equal(r.avg7, 4);
  assert.equal(r.tankers7, 1);
  assert.equal(r.yearAgo7, 100);
  assert.equal(r.vsYear, -96);
  assert.equal(r.disrupted, true);
  assert.equal(r.asOf, end);
  assert.equal(r.weekly[r.weekly.length - 1].value, 4);
  assert.equal(r.weekly[r.weekly.length - 1].ts, end);

  // A quiet route: no flag even when traffic halves, and no comparison without a year of history.
  const small = total.map((p) => ({ ts: p.ts, value: p.value / 20 }));
  assert.equal(chokepointRow(CHOKEPOINTS[0], small, []).disrupted, false);
  const short = chokepointRow(CHOKEPOINTS[0], total.slice(-30), []);
  assert.equal(short.yearAgo7, null);
  assert.equal(short.vsYear, null);
  assert.equal(short.tankers7, null);
});

test("weeklyMeans: whole weeks back from the last day, gaps skipped", () => {
  const pts: Point[] = Array.from({ length: 21 }, (_, i) => ({ ts: i * DAY, value: i < 7 ? 1 : i < 14 ? 2 : 3 }));
  assert.deepEqual(weeklyMeans(pts).map((p) => p.value), [1, 2, 3]);
  // A week with fewer than 5 days of data has no mean.
  assert.deepEqual(weeklyMeans(pts.filter((p) => p.ts < 7 * DAY || p.ts > 10 * DAY)).map((p) => p.value), [1, 3]);
  assert.deepEqual(weeklyMeans([]), []);
});

test("gprHeatmap: last N months, highest recent level first, missing months null", () => {
  const db = openDb(":memory:");
  const month = (m: number) => Date.UTC(2026, m, 1);
  upsertSeries(db, gprCountryId("USA"), "gprc", [0, 1, 2, 3].map((m) => ({ ts: month(m), value: 150 })));
  upsertSeries(db, gprCountryId("ISR"), "gprc", [0, 1, 3].map((m) => ({ ts: month(m), value: 900 })));
  const { months, rows } = gprHeatmap(db, 3);
  assert.deepEqual(months, [month(1), month(2), month(3)]);
  assert.equal(rows[0].iso, "ISR");
  assert.deepEqual(rows[0].cells, [900, null, 900]);
  assert.equal(rows[0].recent, 900);
  assert.equal(rows[1].iso, "USA");
  // Countries without data sort last with empty rows.
  assert.equal(rows[rows.length - 1].recent, null);
  assert.deepEqual(gprHeatmap(openDb(":memory:")), { months: [], rows: [] });
});

test("binOf: class edges are inclusive at the bottom", () => {
  assert.equal(binOf(99, GPR_BINS), 0);
  assert.equal(binOf(100, GPR_BINS), 1);
  assert.equal(binOf(499, GPR_BINS), 4);
  assert.equal(binOf(5000, GPR_BINS), 5);
});

test("elections: sorted, well-formed, and in the brief's calendar on polling day", () => {
  const dates = ELECTIONS.map((e) => e.date);
  assert.deepEqual([...dates].sort(), dates);
  for (const e of ELECTIONS) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(electionTs(e)));
    assert.match(e.source, /^https:\/\//);
  }
  const taiwan = ELECTIONS.find((e) => e.code === "TW")!;
  const db = openDb(":memory:");
  // 06:00 Hanoi on polling day, when the brief is written.
  const brief = calendarForBrief(db, Date.parse(`${taiwan.date}T00:00:00Z`) - 1 * 3600_000);
  const hit = brief.upcoming.find((e) => e.country === "TW");
  assert.ok(hit, "the election is in the brief's calendar");
  assert.equal(hit.impact, "High");
  assert.match(hit.event, /Taiwan nationwide local elections/);
});
