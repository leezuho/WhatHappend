import assert from "node:assert/strict";
import { hostname } from "node:os";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { fmtDelta, fmtSigned, fmtValue } from "@/lib/format";
import { SERIES } from "@/config/series";
import { isCrossOrigin } from "@/lib/same-origin";
import { acquireWorkerLock, refreshWorkerLock, releaseWorkerLock } from "@/worker/lock";

// ---------------------------------------------------------------- same-origin guard

const post = (headers: Record<string, string>) => new Request("http://127.0.0.1:3000/api/brief", { method: "POST", headers });

test("isCrossOrigin: Sec-Fetch-Site decides when the browser sends it", () => {
  assert.equal(isCrossOrigin(post({ "sec-fetch-site": "same-origin" })), false);
  assert.equal(isCrossOrigin(post({ "sec-fetch-site": "none" })), false);
  assert.equal(isCrossOrigin(post({ "sec-fetch-site": "same-site" })), true, "another port on localhost");
  assert.equal(isCrossOrigin(post({ "sec-fetch-site": "cross-site" })), true);
});

test("isCrossOrigin: falls back to Origin vs Host, and lets header-less clients through", () => {
  assert.equal(isCrossOrigin(post({})), false, "curl");
  assert.equal(isCrossOrigin(post({ origin: "http://localhost:3000", host: "localhost:3000" })), false);
  assert.equal(isCrossOrigin(post({ origin: "https://evil.example", host: "localhost:3000" })), true);
  assert.equal(isCrossOrigin(post({ origin: "http://localhost:5173", host: "localhost:3000" })), true);
});

// ---------------------------------------------------------------- worker lock

const STALE = 60_000;
const holderRow = (db: ReturnType<typeof openDb>, pid: number, host: string, ageMs = 0) =>
  db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES ('worker:lock', ?, ?)").run(JSON.stringify({ pid, host }), Date.now() - ageMs);

test("worker lock: first worker takes it, a live second one is refused", () => {
  const db = openDb(":memory:");
  assert.deepEqual(acquireWorkerLock(db, STALE), { ok: true });
  assert.equal(refreshWorkerLock(db), true);

  holderRow(db, process.ppid, hostname()); // a live process on this machine
  const r = acquireWorkerLock(db, STALE);
  assert.equal(r.ok, false);
  assert.equal(refreshWorkerLock(db), false, "the original holder notices it lost the lock");
});

test("worker lock: taken over from a dead process, a stale heartbeat, or our own reused pid", () => {
  const db = openDb(":memory:");
  holderRow(db, 999_999, hostname());
  assert.equal(acquireWorkerLock(db, STALE).ok, true, "pid no longer exists");
  holderRow(db, 4242, "other-host", 2 * STALE);
  assert.equal(acquireWorkerLock(db, STALE).ok, true, "heartbeat too old");
  holderRow(db, process.pid, hostname());
  assert.equal(acquireWorkerLock(db, STALE).ok, true, "a crashed predecessor with our pid");
});

test("worker lock: a fresh lock on another host is respected; release only removes our own", () => {
  const db = openDb(":memory:");
  holderRow(db, 4242, "other-host");
  assert.equal(acquireWorkerLock(db, STALE).ok, false);
  releaseWorkerLock(db);
  const row = db.prepare("SELECT value FROM kv WHERE key = 'worker:lock'").get() as { value: string } | undefined;
  assert.equal(row?.value, JSON.stringify({ pid: 4242, host: "other-host" }));
});

// ---------------------------------------------------------------- formatting

test("format: signed values, basis points for yields, units", () => {
  assert.equal(fmtSigned(-1.5, "en", 1), "−1.5");
  assert.equal(fmtSigned(0, "en", 1), "±0.0");
  const tile = { value: 4.31, change: 0.052, changePct: null, ts: 0, spark: [] };
  assert.equal(fmtDelta(SERIES.us10y, tile, "en"), "+5 bp");
  assert.equal(fmtValue(SERIES.us10y, 4.31, "en"), "4.31%");
  assert.equal(fmtValue(SERIES.us10y, 4.31, "vi"), "4,31%");
});
