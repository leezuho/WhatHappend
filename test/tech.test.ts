import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { CRYPTO_OUTLETS, TECH_OUTLETS } from "@/config/feeds";
import { TECH_STOCKS } from "@/config/tech";
import { recentHeadlines } from "@/lib/ai/brief";
import { awsStatus, decodeUtf16, gcpStatus, statuspageStatus, worstImpact } from "@/lib/sources/cloudstatus";
import { pickNewModels } from "@/lib/sources/openrouter";
import { topPapers, trendingModels } from "@/lib/sources/huggingface";
import { recentKev } from "@/lib/sources/kev";
import { replaceItems, upsertQuotes, upsertSeries } from "@/lib/sources/store";
import { changeSince, techStockRows, thin } from "@/lib/data/tech";

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 10, 9, 8);

test("statuspageStatus: an open incident outranks a page that still says operational", () => {
  const s = statuspageStatus(
    { indicator: "none", description: "All Systems Operational" },
    [{ id: "abc", name: "Increased timeouts", status: "investigating", impact: "minor", created_at: "2026-11-09T05:59:07Z" }],
    "https://www.githubstatus.com",
  );
  assert.equal(s.level, "minor");
  assert.equal(s.description, "All Systems Operational");
  assert.equal(s.incidents[0].url, "https://www.githubstatus.com/incidents/abc", "no shortlink: falls back to the incident page");
  assert.equal(statuspageStatus({ indicator: "none", description: "" }, [], "x").level, "none");
  assert.equal(statuspageStatus({ indicator: "weird", description: "" }, [], "x").level, "unknown", "an unknown indicator is not read as operational");
  assert.equal(worstImpact([]), "none");
});

test("AWS feed: UTF-16 big-endian with a BOM, resolved events dropped, worst first", () => {
  const json = JSON.stringify([
    { date: "1772369485", region_name: "UAE", status: "3", service_name: "Multiple services", summary: "Region Availability" },
    { date: "1772430987", region_name: "N. Virginia", status: "2", service_name: "Amazon EC2", summary: "Increased latency" },
    { date: "1772430000", region_name: "Ireland", status: "0", service_name: "Amazon S3", summary: "Resolved" },
  ]);
  const le = Buffer.from(json, "utf16le");
  const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()]);
  assert.equal(decodeUtf16(be), json);
  assert.equal(decodeUtf16(Buffer.concat([Buffer.from([0xff, 0xfe]), le])), json);
  assert.equal(decodeUtf16(Buffer.from(json)), json, "plain UTF-8 still works");

  const s = awsStatus(JSON.parse(decodeUtf16(be)), "https://health.aws.amazon.com/health/status");
  assert.equal(s.level, "major");
  assert.deepEqual(
    s.incidents.map((i) => [i.where, i.impact]),
    [
      ["UAE", "major"],
      ["N. Virginia", "minor"],
    ],
  );
  assert.equal(s.incidents[0].since, 1772369485 * 1000);
  assert.equal(awsStatus([], "x").level, "none");
});

test("gcpStatus: only incidents without an end are open", () => {
  const s = gcpStatus(
    [
      { id: "a", begin: "2026-10-20T06:00:00+00:00", end: "2026-10-20T12:08:00+00:00", external_desc: "Old", status_impact: "SERVICE_OUTAGE", uri: "incidents/a" },
      {
        id: "b",
        begin: "2026-11-09T06:00:00+00:00",
        end: null,
        external_desc: " Vertex AI errors ",
        status_impact: "SERVICE_DISRUPTION",
        uri: "incidents/b",
        currently_affected_locations: [{ title: "Iowa (us-central1)" }],
      },
    ],
    "https://status.cloud.google.com",
  );
  assert.equal(s.level, "minor");
  assert.equal(s.incidents.length, 1);
  assert.deepEqual([s.incidents[0].title, s.incidents[0].where, s.incidents[0].url], ["Vertex AI errors", "Iowa (us-central1)", "https://status.cloud.google.com/incidents/b"]);
});

test("pickNewModels: last 30 days, no variants or routers, price per million tokens", () => {
  const sec = (daysAgo: number) => Math.floor((NOW - daysAgo * DAY) / 1000);
  const m = (id: string, name: string, daysAgo: number, prompt = "0.0000015", completion = "0.000009", hf: string | null = null) => ({
    id,
    name,
    created: sec(daysAgo),
    context_length: 131072,
    hugging_face_id: hf,
    pricing: { prompt, completion },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  });
  const rows = pickNewModels(
    [
      m("google/gemini-omni-1.2-flash", "Google: Gemini Omni 1.2 Flash", 3),
      m("liquid/lfm-3-1.7b", "LiquidAI: LFM3-1.7B", 2, "0.00000008", "0.0000002", "LiquidAI/LFM3-1.7B"),
      m("liquid/lfm-3-1.7b:free", "LiquidAI: LFM3-1.7B (free)", 2, "0", "0"),
      m("openrouter/auto", "Auto Router", 4, "-1", "-1"),
      m("~unbiased/pareto-latest", "Pareto latest", 5),
      m("old/model", "Old: Model", 45),
      m("router/x", "Varies", 1, "-1", "-1"),
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["router/x", "liquid/lfm-3-1.7b", "google/gemini-omni-1.2-flash"],
  );
  const lfm = rows[1];
  assert.deepEqual([lfm.provider, lfm.name, lfm.priceIn, lfm.priceOut, lfm.open], ["LiquidAI", "LFM3-1.7B", 0.08, 0.2, true]);
  assert.equal(rows[2].priceOut, 9);
  assert.deepEqual([rows[0].provider, rows[0].priceIn], ["router", null], "a negative price means 'varies', not free");
});

test("Hugging Face: papers from the last 3 days by upvotes; repackaged models left out", () => {
  const p = (id: string, upvotes: number, daysAgo: number) => ({
    numComments: 1,
    paper: { id, title: id, upvotes, submittedOnDailyAt: new Date(NOW - daysAgo * DAY).toISOString() },
  });
  assert.deepEqual(
    topPapers([p("a", 10, 0), p("b", 40, 2), p("c", 99, 5), p("d", 10, 1)], NOW).map((x) => x.id),
    ["b", "a", "d"],
    "ties go to the newer paper",
  );
  assert.deepEqual(
    trendingModels([
      { id: "Qwen/Qwen3.8-27B", trendingScore: 300 },
      { id: "someone/Qwen3.8-27B-GGUF", trendingScore: 900 },
      { id: "x/DeepSeek-V4-Uncensored-heretic", trendingScore: 700 },
      { id: "y/flux-3-image-klein-comfy", trendingScore: 500 },
      { id: "moonshotai/Kimi-K3.1-Pro", trendingScore: 568 },
    ]).map((m) => m.id),
    ["moonshotai/Kimi-K3.1-Pro", "Qwen/Qwen3.8-27B"],
  );
});

test("recentKev: last 30 days, newest first, then higher CVE number", () => {
  const v = (cveID: string, dateAdded: string) => ({ cveID, vendorProject: "V", product: "P", vulnerabilityName: "V P Bug", dateAdded });
  assert.deepEqual(
    recentKev([v("CVE-2026-9999", "2026-11-03"), v("CVE-2026-119977", "2026-11-03"), v("CVE-2024-27834", "2026-11-04"), v("CVE-2025-1", "2026-09-01")], NOW).map(
      (x) => x.cveID,
    ),
    ["CVE-2024-27834", "CVE-2026-119977", "CVE-2026-9999"],
  );
});

test("replaceItems keeps the stored translation while the title is unchanged", () => {
  const db = openDb(":memory:");
  replaceItems(db, "hf_papers", [
    { id: "a", title: "Same title" },
    { id: "b", title: "Old title" },
  ]);
  db.prepare("UPDATE items SET title_vi = 'bản dịch ' || id WHERE kind = 'hf_papers'").run();
  replaceItems(db, "hf_papers", [
    { id: "a", title: "Same title" },
    { id: "b", title: "New title" },
    { id: "c", title: "Explicit", titleVi: "có sẵn" },
  ]);
  const vi = Object.fromEntries((db.prepare("SELECT id, title_vi FROM items WHERE kind = 'hf_papers'").all() as { id: string; title_vi: string | null }[]).map((r) => [r.id, r.title_vi]));
  assert.deepEqual(vi, { a: "bản dịch a", b: null, c: "có sẵn" });
  db.close();
});

test("recentHeadlines: tech outlets stay out of the world list and come back on request", () => {
  const db = openDb(":memory:");
  const now = Date.now();
  const add = db.prepare("INSERT INTO articles (id, url, source, lang, title, title_key, published_at, fetched_at) VALUES (?, ?, ?, 'en', ?, ?, ?, ?)");
  add.run("a", "https://bbc/a", "BBC", "World story", "world story", now - 60_000, now);
  add.run("b", "https://verge/b", TECH_OUTLETS[0], "Chip story", "chip story", now - 30_000, now);
  add.run("c", "https://cd/c", CRYPTO_OUTLETS[0], "Coin story", "coin story", now - 20_000, now);
  assert.deepEqual(
    recentHeadlines(db, now).map((h) => h.source),
    ["BBC"],
  );
  assert.deepEqual(
    recentHeadlines(db, now, 10, "tech").map((h) => h.source),
    [TECH_OUTLETS[0]],
  );
  db.close();
});

test("changeSince and thin", () => {
  const pts = [10, 11, 12, 13, 14].map((value, i) => ({ ts: i * DAY, value }));
  assert.equal(changeSince(pts, 15, 2 * DAY), 25, "from the close on that day");
  assert.equal(changeSince(pts, 15, 2.5 * DAY), 25, "or the last one before it");
  assert.equal(changeSince(pts, 15, -1), null, "history does not reach back that far");
  const many = Array.from({ length: 250 }, (_, i) => ({ ts: i, value: i }));
  const t = thin(many);
  assert.ok(t.length <= 60);
  assert.equal(t.at(-1)?.value, 249, "keeps the latest point");
});

test("techStockRows: changes from stored closes, caps converted to dollars", () => {
  const db = openDb(":memory:");
  const yearStart = Date.UTC(2026, 0, 1);
  upsertSeries(db, "yahoo:NVDA", "yahoo", [
    { ts: yearStart - DAY, value: 100 },
    { ts: NOW - 40 * DAY, value: 150 },
    { ts: NOW - 30 * DAY - 3600_000, value: 160 },
    { ts: NOW - DAY, value: 175 },
  ]);
  upsertSeries(db, "yahoo:005930.KS", "yahoo", [{ ts: NOW - DAY, value: 180_000 }]);
  upsertQuotes(db, [
    { seriesId: "yahoo:NVDA", price: 200, changePct: 2.5, ts: NOW },
    { seriesId: "yahoo:005930.KS", price: 189_900, changePct: 0.6, ts: NOW },
    { seriesId: "yahoo:KRW=X", price: 1_350, ts: NOW },
  ]);
  replaceItems(db, "tech_caps", [
    { id: "NVDA", title: "NVDA", data: { cap: 4.5e12, currency: "USD" } },
    { id: "005930.KS", title: "005930.KS", data: { cap: 1.35e15, currency: "KRW" } },
    { id: "0700.HK", title: "0700.HK", data: { cap: 3.7e12, currency: "HKD" } },
  ]);
  const rows = techStockRows(db, NOW);
  assert.equal(rows.length, TECH_STOCKS.length);
  const nvda = rows.find((r) => r.symbol === "NVDA")!;
  assert.deepEqual([nvda.price, nvda.ch1d, nvda.ch1m, nvda.chYtd, nvda.capUsd], [200, 2.5, 25, 100, 4.5e12]);
  const samsung = rows.find((r) => r.symbol === "005930.KS")!;
  assert.equal(samsung.capUsd, 1e12);
  assert.equal(samsung.chYtd, null, "no close before the year started");
  assert.equal(rows.find((r) => r.symbol === "0700.HK")!.capUsd, null, "no HKD rate stored: no dollar cap rather than a wrong one");
  assert.equal(rows.find((r) => r.symbol === "FPT.VN")!.price, null);
  db.close();
});
