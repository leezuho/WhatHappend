import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import type { SeriesDef } from "@/config/series";
import { THEMES, type ThemeDef, type ThemeGauge } from "@/config/themes";
import { gaugeText, matchesNews, readGauge, statusOf, themeForPrompt, themeHeat, themeStates, type GaugeReading } from "@/lib/data/themes";
import { basisOf, isWhole, pickTier, themesDue } from "@/lib/ai/themes";
import { recordCall } from "@/lib/ai/budget";
import type { AiConfig } from "@/lib/ai/config";
import { vnDate } from "@/lib/ai/brief";
import type { StoredThemeNotes } from "@/lib/ai/themes-shared";
import { replaceItems, upsertSeries } from "@/lib/sources/store";
import { macroInput } from "@/lib/ai/macronote";

const DAY = 86_400_000;
const H = 3_600_000;
const label = { en: "x", vi: "x" };

const price = (id: string): SeriesDef => ({
  id,
  name: { en: id, vi: id },
  short: id,
  unit: "",
  digits: 2,
  polarity: "neutral",
  delta: "pct",
  explain: { en: "", vi: "" },
});

/** A daily series wobbling ±1% around 100 for two years, then `last` on the final day. */
function wobble(db: ReturnType<typeof openDb>, id: string, now: number, last: number) {
  const start = Math.floor(now / DAY) * DAY - 730 * DAY;
  const pts = [];
  for (let i = 0; i < 730; i++) pts.push({ ts: start + i * DAY, value: 100 * (1 + 0.01 * Math.sin(i * 1.7)) });
  pts.push({ ts: start + 730 * DAY, value: last });
  upsertSeries(db, id, "test", pts);
}

test("readGauge: a month's move against its usual size, signed by the gauge, clamped to ±3", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 12);
  wobble(db, "t:UP", now, 130);
  wobble(db, "t:FLAT", now, 100.5);
  const up = readGauge(db, { series: price("t:UP"), sign: 1, label }, now)!;
  assert.ok(up.change! > 25 && up.change! < 35, `month change ${up.change}`);
  assert.equal(up.heat, 3, "a 30% month against ±1% wobbles clamps to +3");
  assert.equal(up.from! < up.ts - 29 * DAY, true, "measured from about a month earlier");
  assert.equal(readGauge(db, { series: price("t:UP"), sign: -1, label }, now)!.heat, -3, "sign −1 flips it");
  const flat = readGauge(db, { series: price("t:FLAT"), sign: 1, label }, now)!;
  assert.ok(Math.abs(flat.heat!) < 1, `a normal month stays small (${flat.heat})`);
  assert.equal(readGauge(db, { series: price("t:NONE"), sign: 1, label }, now), null, "no data, no reading");
});

test("readGauge: late daily data and short histories are shown but not counted", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 12);
  wobble(db, "t:OLD", now - 20 * DAY, 120);
  const old = readGauge(db, { series: price("t:OLD"), sign: 1, label }, now)!;
  assert.equal(old.value, 120);
  assert.equal(old.heat, null, "last point 20 days old");
  upsertSeries(db, "t:NEW", "test", [
    { ts: now - 40 * DAY, value: 100 },
    { ts: now - DAY, value: 110 },
  ]);
  const young = readGauge(db, { series: price("t:NEW"), sign: 1, label }, now)!;
  assert.equal(Math.round(young.change!), 10, "the change is still shown");
  assert.equal(young.heat, null, "one earlier move is no yardstick");
});

test("readGauge: a flow is read as its rolling sum against the history of such sums", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 12);
  const start = now - 300 * DAY;
  const pts = Array.from({ length: 300 }, (_, i) => ({ ts: start + i * DAY, value: i >= 280 ? -500e9 : (i % 2 ? 50e9 : -50e9) }));
  upsertSeries(db, "t:FLOW", "test", pts);
  const g: ThemeGauge = { series: { ...price("t:FLOW"), unit: "₫", delta: "abs" }, sign: -1, sumSessions: 20, label };
  const r = readGauge(db, g, now)!;
  assert.equal(r.value, -10_000e9, "20 sessions of −500 bn");
  assert.equal(r.change, null);
  assert.ok(r.heat! > 2, `heavy selling heats the theme (${r.heat})`);
  assert.match(gaugeText(r), /-10,000 billion VND/);
});

test("themeHeat and statusOf: two counted gauges at least, ±0.5 thresholds", () => {
  const g = (heat: number | null) => ({ heat }) as GaugeReading;
  assert.equal(themeHeat([g(2), null, g(null)]), null, "one gauge is not a theme");
  assert.equal(themeHeat([g(1), g(0), g(null)]), 0.5);
  assert.equal(statusOf(0.5), "heating");
  assert.equal(statusOf(0.49), "steady");
  assert.equal(statusOf(-0.5), "cooling");
  assert.equal(statusOf(null), "unknown");
});

test("matchesNews: theme keywords, outlets and regions", () => {
  const energy = THEMES.find((t) => t.id === "energy")!.news;
  const fed = THEMES.find((t) => t.id === "fed")!.news;
  const ai = THEMES.find((t) => t.id === "ai")!.news;
  const vn = THEMES.find((t) => t.id === "vnCapital")!.news;
  const a = (title: string, extra: Partial<{ source: string; lang: string; region: string | null; topic: string | null; title_en: string | null }> = {}) => ({
    source: "BBC",
    lang: "en",
    region: "global",
    topic: "economy",
    title,
    title_en: null,
    ...extra,
  });
  assert.equal(matchesNews(energy, a("Brent crude falls below $90 on Iran war de-escalation hopes")), true);
  assert.equal(matchesNews(energy, a("Iran war live: Hegseth survives impeachment bid; Iran denies US talks")), true);
  assert.equal(matchesNews(energy, a("Is the US war on Iran about to end?")), true);
  assert.equal(matchesNews(energy, a("France vows tough response to freezer cyberattack blamed on Iran")), false, "Iran without the war or oil");
  assert.equal(matchesNews(energy, a("Oil prices slide", { topic: "sports" })), false);
  assert.equal(matchesNews(energy, a("Giá xăng giảm mạnh", { lang: "vi", region: "vietnam" })), true, "untranslated Vietnamese");
  assert.equal(matchesNews(fed, a("Bank of England's inflation response", { region: "europe" })), false, "not the US");
  assert.equal(matchesNews(fed, a("Bitcoin falls after hot CPI", { source: "CoinDesk" })), false, "crypto desk");
  assert.equal(matchesNews(ai, a("Nvidia chip deal questioned", { source: "TechCrunch" })), true, "the AI theme reads the tech desk");
  assert.equal(matchesNews(fed, a("Fed chair speaks", { source: "TechCrunch", region: "americas" })), false, "other themes do not");
  assert.equal(matchesNews(ai, a("Alice Huang's husband is in prison")), false, "Huang alone is not Nvidia");
  assert.equal(matchesNews(vn, a("Tỷ giá", { title_en: "Banks lower USD exchange rate", region: "vietnam", source: "VnExpress", lang: "vi" })), true);
  assert.equal(matchesNews(vn, a("Profits over 1,000 billion dong", { region: "vietnam", source: "VnExpress" })), false, "dong as a unit");
  assert.equal(matchesNews(vn, a("Dong Nai appoints a new vice chairman", { region: "vietnam", source: "VnExpress" })), false, "Dong as a place");
  assert.equal(matchesNews(vn, a("US exchange rate policy", { region: "americas" })), false, "region");
});

test("themeStates: status, facts, news and odds from the database; settled markets left out", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 12);
  wobble(db, "t:A", now, 130);
  wobble(db, "t:B", now, 125);
  const theme: ThemeDef = {
    id: "energy",
    name: { en: "Test", vi: "Thử" },
    heat: { en: "h", vi: "h" },
    gauges: [
      { series: price("t:A"), sign: 1, label },
      { series: price("t:B"), sign: 1, label },
    ],
    facts: ["fxCeiling"],
    news: { en: /\boil\b/i },
    markets: /\biran\b/i,
  };
  upsertSeries(db, "sbv:CENTRAL", "test", [{ ts: now - DAY, value: 25000 }]);
  upsertSeries(db, "vcb:USD:sell", "test", [{ ts: now - DAY, value: 25800 }]);
  const art = db.prepare(
    "INSERT INTO articles (id, url, source, lang, region, topic, title, title_key, published_at, fetched_at) VALUES (?, ?, 'BBC', 'en', 'global', 'economy', ?, ?, ?, ?)",
  );
  art.run("1", "https://x/1", "Oil prices jump as tankers avoid the Gulf", "k1", now - H, now);
  art.run("2", "https://x/2", "Oil prices jump as tankers avoid Gulf waters", "k2", now - 2 * H, now);
  art.run("3", "https://x/3", "Oil demand outlook cut", "k3", now - 3 * DAY, now);
  art.run("4", "https://x/4", "Football final tonight", "k4", now - H, now);
  replaceItems(db, "polymarket", [
    { id: "m1", title: "Iran ceasefire holds through Friday?", data: { volume24hr: 9e6, outcomes: [{ label: "Yes", prob: 0.99, change24h: 0 }] } },
    { id: "m2", title: "US ends Iran blockade by March 31?", url: "https://p/2", data: { volume24hr: 1e6, outcomes: [{ label: "Yes", prob: 0.62, change24h: -0.03 }] } },
    { id: "m3", title: "Fed hikes in December?", data: { volume24hr: 5e6, outcomes: [{ label: "Yes", prob: 0.8, change24h: 0 }] } },
  ]);
  const [s] = themeStates(db, now, [theme]);
  assert.equal(s.status, "heating");
  assert.equal(s.heat, 3);
  assert.match(s.facts[0].text.en, /25,800 ₫, 450 ₫ \(1\.7%\) below/);
  assert.match(s.facts[0].text.vi, /cách trần biên độ 450 ₫/);
  assert.deepEqual([s.news.day, s.news.week], [2, 3]);
  assert.equal(s.news.latest.length, 1, "the two Gulf headlines are one story; the 3-day-old one is outside the latest window");
  assert.equal(s.news.latest[0].alsoIn, 1);
  assert.deepEqual(
    s.markets.map((m) => [m.title, m.prob]),
    [["US ends Iran blockade by March 31?", 0.62]],
    "near-certain market dropped, other theme's market not matched",
  );
  const p = themeForPrompt(s);
  assert.equal(p.status, "heating");
  assert.equal(p.headlines?.length, 1);
  assert.match(p.predictionMarkets[0], /62% \(24h -3 pts\)/);
  assert.equal(themeForPrompt(s, false).headlines, undefined);
});

test("themesDue: daily after 06:00 Vietnam time, rewrites on a status change at most every 6 hours", () => {
  const morning = Date.UTC(2026, 10, 11, 0, 30); // 07:30 in Vietnam
  const early = Date.UTC(2026, 10, 10, 22, 0); // 05:00 in Vietnam
  const note = (createdAt: number): StoredThemeNotes => ({ date: vnDate(createdAt), createdAt, model: "m", basis: "", notes: {} });
  assert.equal(themesDue(null, null, early), true, "nothing written yet");
  assert.equal(themesDue(note(morning - DAY), morning - H, early), false, "yesterday's note, before 06:00");
  assert.equal(themesDue(note(morning - DAY), morning - H, morning), true, "yesterday's note, after 06:00");
  assert.equal(themesDue(note(morning), morning, morning + 2 * H), false, "written two hours ago");
  assert.equal(themesDue(note(morning), morning + 6 * H, morning + 6.2 * H), false, "checked 12 minutes ago");
  assert.equal(themesDue(note(morning), morning + 5 * H, morning + 6.2 * H), true, "six hours on, last check over half an hour ago");
});

test("pickTier: the daily note may use the brief model down to one call, a rewrite only above the reserve", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 1);
  const cfg: AiConfig = { provider: "gemini", apiKey: "x", models: { brief: "b", fast: "f" } };
  assert.equal(pickTier(db, cfg, now, false), "brief", "20 calls left");
  for (let i = 0; i < 14; i++) recordCall(db, "b", now);
  assert.equal(pickTier(db, cfg, now, false), "fast", "6 left = the reserve");
  assert.equal(pickTier(db, cfg, now, true), "brief", "the daily note still gets it");
  for (let i = 0; i < 5; i++) recordCall(db, "b", now);
  assert.equal(pickTier(db, cfg, now, true), "fast", "the last call is the daily brief's");
});

test("basisOf: one status per theme, in order", () => {
  assert.equal(basisOf([{ def: THEMES[0], status: "cooling" }, { def: THEMES[1], status: "heating" }]), "energy:cooling,fed:heating");
});

test("macroInput carries the themes (without their headlines)", () => {
  const db = openDb(":memory:");
  const { input } = macroInput(db, Date.UTC(2026, 10, 11, 1));
  assert.deepEqual(
    input.themes.map((t) => t.id),
    THEMES.map((t) => t.id),
  );
  assert.equal(input.themes.every((t) => !("headlines" in t)), true);
});

test("isWhole: a theme note cut off mid-sentence is caught", () => {
  assert.equal(isWhole("Cổ phiếu ngành chip và các"), false);
  assert.equal(isWhole("Brent has slid back from its peak."), true);
  assert.equal(isWhole('Theo BBC, "ông Huang từ chức." '), true);
  assert.equal(isWhole("Markets expect a hike (December)."), true);
  assert.equal(isWhole("Is the dollar turning?"), true);
});
