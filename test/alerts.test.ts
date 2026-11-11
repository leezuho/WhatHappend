import assert from "node:assert/strict";
import { test } from "node:test";
import { SERIES } from "@/config/series";
import { VN_CENTRAL_RATE } from "@/config/vietnam";
import { openDb } from "@/lib/db";
import {
  ALERTS_STATE_KEY,
  eventLine,
  packMessages,
  parseAlertState,
  pendingEvents,
  planAlerts,
  polymarketCheck,
  sjcCheck,
  statusChecks,
  stepConditions,
  vcbCheck,
  type CheckGroup,
} from "@/lib/data/alerts";
import { logChanges, type ChangeData } from "@/lib/data/changes";
import type { ServiceStatus } from "@/lib/sources/cloudstatus";
import { replaceItems, upsertSeries } from "@/lib/sources/store";
import { sendTelegram, telegram } from "@/lib/sources/telegram";

const H = 3_600_000;
const DAY = 24 * H;
/** 12:00 in Hanoi on 2026-11-11. */
const NOW = Date.UTC(2026, 10, 11, 5);

const group = (prefix: string, exhaustive: boolean, checks: CheckGroup["checks"]): CheckGroup => ({ prefix, exhaustive, checks });

test("stepConditions: sent once while on, again only after it ended; exhaustive groups close missing keys", () => {
  const on = (key: string) => ({ key, state: "on" as const, html: key });
  let r = stepConditions({}, [group("a:", false, [on("a:1")])], NOW);
  assert.deepEqual(r.fired.map((c) => c.key), ["a:1"]);
  // Still on, then in between the lines: nothing new, still in force.
  r = stepConditions(r.active, [group("a:", false, [on("a:1")])], NOW + H);
  assert.equal(r.fired.length, 0);
  r = stepConditions(r.active, [group("a:", false, [{ key: "a:1", state: "hold" }])], NOW + 2 * H);
  assert.ok("a:1" in r.active);
  // Not evaluated (data stale): kept. Off: ended, so the next "on" is sent again.
  r = stepConditions(r.active, [], NOW + 3 * H);
  assert.ok("a:1" in r.active);
  r = stepConditions(r.active, [group("a:", false, [{ key: "a:1", state: "off" }])], NOW + 4 * H);
  assert.deepEqual(r.active, {});
  r = stepConditions(r.active, [group("a:", false, [on("a:1")])], NOW + 5 * H);
  assert.deepEqual(r.fired.map((c) => c.key), ["a:1"]);

  // A closed incident is simply missing from its page's list; another page's keys are untouched.
  const prev = { "s:aws:x": NOW, "s:aws:y": NOW, "s:gcp:z": NOW };
  r = stepConditions(prev, [group("s:aws:", true, [on("s:aws:y")])], NOW + H);
  assert.deepEqual(Object.keys(r.active).sort(), ["s:aws:y", "s:gcp:z"]);
  assert.equal(r.fired.length, 0);
  // Not seen for more than three days: forgotten.
  r = stepConditions(r.active, [], NOW + 4 * DAY);
  assert.deepEqual(r.active, {});
});

test("vcbCheck: on under 2% from the ceiling, off from 2.5%, in between holds; stale rate says nothing", () => {
  const db = openDb(":memory:");
  upsertSeries(db, VN_CENTRAL_RATE, "sbvrate", [{ ts: NOW - DAY, value: 25000 }]); // ceiling 26,250
  const at = (value: number, ts = NOW - H) => {
    upsertSeries(db, SERIES.vcbUsd.id, "vcb", [{ ts, value }]);
    return vcbCheck(db, NOW, "vi")?.checks[0];
  };
  const c = at(25800); // 1.7%
  assert.equal(c?.state, "on");
  assert.match(c!.html!, /25\.800 ₫, cách trần biên độ 1,7%/);
  assert.equal(at(25650, NOW - H / 2)?.state, "hold"); // 2.3%
  assert.equal(at(25500, NOW - H / 4)?.state, "off"); // 2.9%
  db.exec("DELETE FROM observations WHERE series_id = 'vcb:USD:sell'");
  assert.equal(at(25800, NOW - 4 * DAY), undefined);
});

test("sjcCheck: today's premium against the previous day's; needs a price today", () => {
  const db = openDb(":memory:");
  const d0 = Date.UTC(2026, 10, 10);
  const d1 = Date.UTC(2026, 10, 11);
  upsertSeries(db, SERIES.gold.id, "yahoo", [{ ts: d0, value: 4000 }, { ts: d1, value: 4000 }]);
  upsertSeries(db, SERIES.usdvnd.id, "yahoo", [{ ts: d0, value: 26000 }, { ts: d1, value: 26000 }]);
  // World gold ≈ 125.4 million ₫/lượng both days.
  upsertSeries(db, SERIES.sjcGold.id, "sjc", [{ ts: d0 + 3 * H, value: 140e6 }]);
  assert.equal(sjcCheck(db, NOW, "vi"), null);
  upsertSeries(db, SERIES.sjcGold.id, "sjc", [{ ts: d1 + 3 * H, value: 144e6 }]);
  const g = sjcCheck(db, NOW, "vi")!;
  assert.deepEqual(
    g.checks.map((c) => [c.key, c.state]),
    [
      ["sjc:up", "on"],
      ["sjc:down", "off"],
    ],
  );
  assert.match(g.checks[0].html!, /tăng 4,0 triệu ₫\/lượng so với ngày 10\/11/);
  upsertSeries(db, SERIES.sjcGold.id, "sjc", [{ ts: d1 + 4 * H, value: 142e6 }]);
  assert.equal(sjcCheck(db, NOW, "vi")!.checks[0].state, "hold");
  upsertSeries(db, SERIES.sjcGold.id, "sjc", [{ ts: d1 + 5 * H, value: 139e6 }]);
  assert.deepEqual(sjcCheck(db, NOW, "en")!.checks.map((c) => [c.key, c.state]), [
    ["sjc:down", "off"],
    ["sjc:up", "off"],
  ]);
});

test("polymarketCheck: a 15-point move in 24 hours; crypto ladders and stale lists ignored", () => {
  const db = openDb(":memory:");
  const now = Date.now();
  const ev = (id: string, change24h: number | null) => ({
    id,
    title: `Market ${id}`,
    url: `https://polymarket.com/event/${id}`,
    data: { tag: "economy", volume24hr: 1, outcomes: [{ label: "Yes", prob: 0.62, change24h }] },
  });
  replaceItems(db, "polymarket", [ev("a", 0.2), ev("b", -0.12), ev("c", 0.01), ev("d", null)]);
  replaceItems(db, "polymarket_crypto", [ev("btc", 0.4)]);
  const g = polymarketCheck(db, now, "vi")!;
  assert.deepEqual(
    g.checks.map((c) => [c.key, c.state]),
    [
      ["pm:a", "on"],
      ["pm:b", "hold"],
      ["pm:c", "off"],
      ["pm:d", "off"],
    ],
  );
  assert.match(g.checks[0].html!, /<a href="https:\/\/polymarket.com\/event\/a">Market a<\/a>: Có 62% \(\+20 điểm trong 24 giờ\)/);
  assert.equal(polymarketCheck(db, now + 3 * H, "vi"), null);
});

test("statusChecks: watched pages' incidents at major or worse (or without a severity); unreadable pages skipped", () => {
  const db = openDb(":memory:");
  const now = Date.now();
  const inc = (title: string, impact: ServiceStatus["incidents"][number]["impact"], where: string | null = null) => ({
    title,
    impact,
    status: null,
    since: now - H,
    where,
    url: "https://status.example/<x>",
  });
  const page = (id: string, s: ServiceStatus) => ({ id, title: id, data: s });
  replaceItems(db, "status", [
    page("aws", { level: "major", description: null, incidents: [inc("EC2 outage", "major", "Bahrain"), inc("S3 slow", "minor")] }),
    page("azure", { level: "unknown", description: null, incidents: [inc("Front Door issue", "unknown")] }),
    page("openai", { level: null, description: null, incidents: [], error: "HTTP 503" }),
    page("github", { level: "none", description: "All good", incidents: [] }),
  ]);
  const groups = statusChecks(db, now, "vi");
  assert.deepEqual(
    groups.map((g) => [g.prefix, g.checks.length]),
    [
      ["status:aws:", 1],
      ["status:azure:", 1],
      ["status:github:", 0],
    ],
  );
  assert.match(groups[0].checks[0].html!, /<b>Sự cố AWS<\/b>: <a href="https:\/\/status.example\/&lt;x&gt;">EC2 outage<\/a> \(Bahrain\), gián đoạn lớn/);
  // The incident closes: the page still reads, so its key ends; reopening is sent again.
  const first = stepConditions({}, groups, now);
  replaceItems(db, "status", [page("aws", { level: "none", description: null, incidents: [] })]);
  const closed = stepConditions(first.active, statusChecks(db, now, "vi"), now + H);
  assert.equal(Object.keys(closed.active).filter((k) => k.startsWith("status:aws:")).length, 0);
});

const regime: ChangeData = { kind: "regime", from: "neutral", to: "risk-off", score: -0.62 };
const release = (id: string, surprise: number | null, forecast: string | null = "0.3%"): ChangeData => ({
  kind: "release",
  id,
  event: "CPI m/m",
  country: "USD",
  actual: "0.4%",
  forecast,
  surprise,
  better: surprise === null ? null : surprise < 0,
  ts: NOW - H,
});

test("eventLine and pendingEvents: regime flips and releases off forecast, after the cursor and within 12 hours", () => {
  assert.equal(eventLine(regime, "vi"), "<b>Rủi ro</b>: Trạng thái rủi ro: Trung tính → Né rủi ro (điểm −0,62)");
  assert.equal(eventLine(release("r1", 0.1), "en"), "<b>Data</b>: CPI m/m (USD): 0.4% vs 0.3% forecast · worse than expected");
  assert.equal(eventLine(release("r2", 0), "en"), null);
  assert.equal(eventLine(release("r3", null, null), "en"), null);
  assert.equal(eventLine({ kind: "kev", id: "CVE-1", vendor: "Microsoft", product: "Windows", title: "x", url: null, ransomware: false }, "en"), null);

  const db = openDb(":memory:");
  logChanges(db, [{ key: "old", data: release("old", 0.2) }], NOW - 13 * H);
  logChanges(db, [{ key: "risk-off", data: regime }], NOW - H);
  logChanges(db, [{ key: "r0", data: release("r0", 0) }], NOW - H);
  const all = pendingEvents(db, 0, NOW, "vi");
  assert.equal(all.lines.length, 1);
  assert.match(all.lines[0], /Né rủi ro/);
  assert.equal(all.cursor, 3);
  assert.deepEqual(pendingEvents(db, 3, NOW, "vi"), { lines: [], cursor: 3 });
});

test("packMessages: splits under Telegram's limit, header on each message", () => {
  const long = "x".repeat(1500);
  const out = packMessages("<b>H</b>", [long, long, long]);
  assert.equal(out.length, 2);
  assert.ok(out.every((m) => m.startsWith("<b>H</b>\n• ") && m.length <= 3800));
  assert.deepEqual(packMessages("<b>H</b>", []), []);
});

test("planAlerts: the first run says it is on and lists what is in force; later runs send only what is new", () => {
  const db = openDb(":memory:");
  upsertSeries(db, VN_CENTRAL_RATE, "sbvrate", [{ ts: NOW - DAY, value: 25000 }]);
  upsertSeries(db, SERIES.vcbUsd.id, "vcb", [{ ts: NOW - H, value: 25800 }]);
  logChanges(db, [{ key: "risk-off", data: regime }], NOW - 2 * H);

  const first = planAlerts(db, null, NOW, "vi");
  assert.equal(first.messages.length, 1);
  assert.match(first.messages[0], /Đã bật cảnh báo Telegram\.[\s\S]*Đang có:\n• <b>Tỷ giá<\/b>/);
  assert.doesNotMatch(first.messages[0], /Né rủi ro/);
  assert.deepEqual(first.next, { cursor: 1, active: { "vcb:ceiling": NOW } });

  const quiet = planAlerts(db, first.next, NOW + 5 * 60_000, "vi");
  assert.deepEqual(quiet.messages, []);

  logChanges(db, [{ key: "r1", data: release("r1", 0.1) }], NOW + 9 * 60_000);
  const next = planAlerts(db, quiet.next, NOW + 10 * 60_000, "vi");
  assert.equal(next.lines, 1);
  assert.match(next.messages[0], /^<b>WhatHappend<\/b>\n• <b>Số liệu<\/b>: CPI m\/m \(USD\): thực tế 0.4%, dự báo 0.3% · xấu hơn dự báo$/);
  assert.equal(next.next.cursor, 2);
});

test("parseAlertState: junk reads as no state", () => {
  assert.equal(parseAlertState(null), null);
  assert.equal(parseAlertState("{"), null);
  assert.equal(parseAlertState('{"active":{}}'), null);
  assert.deepEqual(parseAlertState('{"cursor":4}'), { cursor: 4, active: {} });
});

test("sendTelegram: posts HTML without link previews; errors never show the token", async (t) => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const ok = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  });
  await sendTelegram("123:SECRET", "42", "<b>hi</b>");
  assert.equal(calls[0].url, "https://api.telegram.org/bot123:SECRET/sendMessage");
  assert.deepEqual(calls[0].body, { chat_id: "42", text: "<b>hi</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  ok.mock.restore();

  const denied = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 }));
  await assert.rejects(sendTelegram("123:SECRET", "42", "x"), (err: Error) => err.message === "Telegram HTTP 401: Unauthorized");
  denied.mock.restore();
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("connect failed for https://api.telegram.org/bot123:SECRET/sendMessage");
  });
  await assert.rejects(sendTelegram("123:SECRET", "42", "x"), (err: Error) => !err.message.includes("SECRET") && err.message.includes("bot<token>"));
});

test("telegram source: saves its state only after the messages went out", async (t) => {
  const db = openDb(":memory:");
  process.env.TELEGRAM_BOT_TOKEN = "1:T";
  process.env.TELEGRAM_CHAT_ID = "42";
  let fail = true;
  const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    if (fail) return new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 });
    sent.push(JSON.parse(String(init.body)).text);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const ctx = { db, log: () => {} };
  try {
    await assert.rejects(telegram.run(ctx), /chat not found/);
    assert.equal(db.prepare("SELECT 1 FROM kv WHERE key = ?").get(ALERTS_STATE_KEY), undefined);
    fail = false;
    await telegram.run(ctx);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Đã bật cảnh báo Telegram/);
    assert.ok(parseAlertState((db.prepare("SELECT value FROM kv WHERE key = ?").get(ALERTS_STATE_KEY) as { value: string }).value));
    await telegram.run(ctx);
    assert.equal(sent.length, 1);
  } finally {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});
