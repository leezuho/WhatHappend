import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { CHANGES_STATE_KEY, diffState, logChanges, observe, parseState, readChanges, REGIME_SCORE_ID, stateOf, type Observed, type WatchState } from "@/lib/data/changes";
import { changes } from "@/lib/sources/changes";
import { replaceItems } from "@/lib/sources/store";
import { describeChange, orderChanges } from "@/components/panels/WhatsNew";

const H = 3_600_000;
const DAY = 24 * H;

const empty = (): Observed => ({ regime: { regime: "neutral", score: 0.1 }, themes: {}, alerts: {}, moves: {}, releases: {}, kev: {} });
const prevState = (over: Partial<WatchState> = {}): WatchState => ({ ...stateOf(empty()), ...over });

test("diffState: new things only; lapses and unknowns are not news", () => {
  const cur = empty();
  cur.regime = { regime: "risk-off", score: 0.9 };
  cur.themes = { ai: { status: "cooling", heat: -1.2 }, fed: { status: "steady", heat: 0 }, energy: { status: "heating", heat: 0.7 } };
  cur.alerts = { brent: { level: "warn", value: 96, ts: 1 }, realYield: { level: "crit", value: 2.6, ts: 1 }, cpi: { level: "warn", value: 3.1, ts: 1 } };
  cur.moves = { "nvda:day:-": { key: "sox", horizon: "day", z: -3, change: -6 }, "brent:week:-": { key: "brent", horizon: "week", z: -2.4, change: -13 } };
  const prev = prevState({
    regime: "neutral",
    themes: { ai: "steady", fed: "steady", energy: "unknown" },
    alerts: { realYield: "warn", cpi: "crit", us10y: "warn" },
    moves: ["brent:week:-"],
  });
  const out = diffState(prev, cur);
  assert.deepEqual(
    out.map((c) => c.key),
    ["risk-off", "ai:cooling", "brent:warn", "realYield:crit", "nvda:day:-"],
    "regime, theme, new and escalated thresholds, new move; not: theme from unknown, crit easing to warn, us10y lapsing, a move already seen",
  );
  assert.deepEqual(out[0].data, { kind: "regime", from: "neutral", to: "risk-off", score: 0.9 });
  const unknown = diffState(prevState({ regime: "unknown" }), cur);
  assert.equal(unknown.some((c) => c.data.kind === "regime"), false, "from 'not enough data' is not a change");
});

test("logChanges: repeats inside a kind's window are dropped, old rows pruned", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 3);
  const warn = { key: "brent:warn", data: { kind: "threshold" as const, key: "brent" as const, level: "warn" as const, value: 96, ts: now } };
  const move = { key: "brent:day:+", data: { kind: "move" as const, key: "brent" as const, horizon: "day" as const, z: 2.5, change: 4 } };
  assert.equal(logChanges(db, [warn, move], now), 2);
  assert.equal(logChanges(db, [warn, move], now + 2 * H), 0, "flapping within hours");
  assert.equal(logChanges(db, [move], now + 21 * H), 1, "a move again the next day");
  assert.equal(logChanges(db, [warn], now + 2 * DAY), 0, "a threshold waits three days");
  assert.equal(logChanges(db, [warn], now + 3.1 * DAY), 1);
  assert.equal(readChanges(db, 0).length, 4);
  logChanges(db, [], now + 31 * DAY);
  assert.equal(readChanges(db, 0).length, 1, "rows older than 30 days are removed");
  assert.equal(readChanges(db, 0)[0].at, now + 3.1 * DAY, "newest first");
});

test("observe: releases with an actual, KEV entries of watched vendors only", () => {
  const db = openDb(":memory:");
  const now = Date.UTC(2026, 10, 11, 3);
  replaceItems(db, "calendar", [
    { id: "cpi", title: "CPI m/m", ts: now - 6 * H, data: { country: "USD", impact: "High", forecast: "0.3%", previous: "0.6%", actual: "0.4%", surprise: 0.1, polarity: "up-bad" } },
    { id: "nfp", title: "Non-Farm Employment Change", ts: now - 7 * H, data: { country: "USD", impact: "High", forecast: "50K", previous: "40K", actual: "80K", surprise: 30, polarity: "up-good" } },
    { id: "ppi", title: "PPI m/m", ts: now + DAY, data: { country: "USD", impact: "High", forecast: "0.4%", previous: "1.3%" } },
  ]);
  replaceItems(db, "kev", [
    { id: "CVE-1", title: "Microsoft Windows flaw", ts: now - DAY, data: { vendor: "Microsoft", product: "Windows", ransomware: true } },
    { id: "CVE-2", title: "Barracuda ESG flaw", ts: now - DAY, data: { vendor: "Barracuda Networks", product: "ESG", ransomware: false } },
    { id: "CVE-3", title: "Old Google flaw", ts: now - 30 * DAY, data: { vendor: "Google", product: "Chrome", ransomware: false } },
  ]);
  const o = observe(db, now);
  assert.deepEqual(Object.keys(o.releases).sort(), ["cpi", "nfp"]);
  assert.equal(o.releases.cpi.better, false, "hotter inflation is worse");
  assert.equal(o.releases.nfp.better, true, "more jobs is better");
  assert.deepEqual(Object.keys(o.kev), ["CVE-1"]);
  assert.equal(o.regime.regime, "unknown", "no market data");
});

test("changes source: the first run only saves the state, later runs log the difference", async () => {
  const db = openDb(":memory:");
  const logs: string[] = [];
  const ctx = { db, log: (m: string) => logs.push(m) };
  replaceItems(db, "kev", [{ id: "CVE-1", title: "t", ts: Date.now() - H, data: { vendor: "Apple", product: "iOS" } }]);
  assert.equal(await changes.run(ctx), 0);
  assert.match(logs[0], /first run/);
  const saved = parseState((db.prepare("SELECT value FROM kv WHERE key = ?").get(CHANGES_STATE_KEY) as { value: string }).value);
  assert.deepEqual(saved?.kev, ["CVE-1"]);
  replaceItems(db, "kev", [
    { id: "CVE-1", title: "t", ts: Date.now() - H, data: { vendor: "Apple", product: "iOS" } },
    { id: "CVE-2", title: "t2", ts: Date.now() - H, data: { vendor: "Linux", product: "Kernel" } },
  ]);
  assert.equal(await changes.run(ctx), 1);
  assert.deepEqual(
    readChanges(db, 0).map((r) => r.data.kind === "kev" && r.data.id),
    ["CVE-2"],
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?").get(REGIME_SCORE_ID) as { n: number }).n, 0, "no score without data");
});

test("describeChange and orderChanges: sentences in both languages, most important first", () => {
  const regime = describeChange({ kind: "regime", from: "neutral", to: "risk-off", score: 0.8 }, "vi")!;
  assert.equal(regime.text, "Trạng thái rủi ro: Trung tính → Né rủi ro");
  assert.equal(regime.tone, "down");
  const crit = describeChange({ kind: "threshold", key: "realYield", level: "crit", value: 2.66, ts: 0 }, "en")!;
  assert.match(crit.text, /rose above its danger level \(2\.50%\): now 2\.66%/);
  const move = describeChange({ kind: "move", key: "us10y", horizon: "day", z: 2.4, change: 0.12 }, "en")!;
  assert.match(move.text, /unusual jump in a session, \+12 bp \(2\.4× the usual\)/);
  const release = describeChange({ kind: "release", id: "x", event: "CPI m/m", country: "USD", actual: "0.4%", forecast: "0.3%", surprise: 0.1, better: false, ts: 0 }, "vi")!;
  assert.equal(release.text, "CPI m/m (USD): thực tế 0.4%, dự báo 0.3% · xấu hơn dự báo");
  const kev = describeChange({ kind: "kev", id: "CVE-9", vendor: "Microsoft", product: "Windows", title: "t", url: null, ransomware: false }, "en")!;
  assert.equal(kev.href, "https://nvd.nist.gov/vuln/detail/CVE-9");
  assert.equal(describeChange({ kind: "theme", id: "gone", from: "steady", to: "heating", heat: 1 }, "en"), null, "a theme removed from config");

  const row = (id: number, at: number, data: Parameters<typeof describeChange>[0]) => ({ id, at, data });
  const ordered = orderChanges([
    row(1, 5, { kind: "kev", id: "CVE-9", vendor: "Apple", product: "iOS", title: "t", url: null, ransomware: false }),
    row(2, 1, { kind: "threshold", key: "brent", level: "warn", value: 96, ts: 0 }),
    row(3, 2, { kind: "threshold", key: "vix", level: "crit", value: 40, ts: 0 }),
    row(4, 3, { kind: "regime", from: "neutral", to: "risk-off", score: 1 }),
    row(5, 4, { kind: "move", key: "brent", horizon: "week", z: -2.5, change: -13 }),
  ]);
  assert.deepEqual(
    ordered.map((r) => r.id),
    [4, 3, 2, 5, 1],
  );
});
