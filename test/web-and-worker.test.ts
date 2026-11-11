import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { fmtDelta, fmtSigned, fmtValue } from "@/lib/format";
import { SERIES } from "@/config/series";
import { isCrossOrigin } from "@/lib/same-origin";
import { acquireWorkerLock, refreshWorkerLock, releaseWorkerLock } from "@/worker/lock";
import { changedSince, importGraph } from "@/worker/code-watch";
import { workerHealth, type WorkerInfo } from "@/lib/worker-info";
import { SOURCE_META } from "@/config/sources";

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

// ---------------------------------------------------------------- worker self-report

test("importGraph: follows runtime imports through @/ and relative paths, skips type-only ones and packages", () => {
  const root = mkdtempSync(path.join(tmpdir(), "wh-graph-"));
  try {
    mkdirSync(path.join(root, "lib/db"), { recursive: true });
    const files: Record<string, string> = {
      "main.ts": [
        'import { a } from "./a";',
        'import type { T } from "./typesOnly";',
        'export type { U } from "./typesOnly2";',
        "import {\n  type V,\n  b,\n} from '@/b';",
        'export * from "./c";',
        'import "./side.json";',
        'const lazy = () => import("./lazy");',
        'import { z } from "zod";',
        'import { readFileSync } from "node:fs";',
        'import { db } from "@/lib/db";',
      ].join("\n"),
      "a.ts": 'import { b } from "./b";\nexport const a = b;',
      "b.ts": "export const b = 1;",
      "c.ts": "export const c = 1;",
      "lazy.ts": "export default 1;",
      "side.json": "{}",
      "typesOnly.ts": "export type T = 1;",
      "typesOnly2.ts": "export type U = 1;",
      "lib/db/index.ts": "export const db = 1;",
      "unused.ts": "export const u = 1;",
    };
    for (const [f, text] of Object.entries(files)) writeFileSync(path.join(root, f), text);
    assert.deepEqual(importGraph("main.ts", root), ["a.ts", "b.ts", "c.ts", "lazy.ts", "lib/db/index.ts", "main.ts", "side.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("importGraph: the real worker reaches every fetcher but no web-only module", () => {
  const files = importGraph("worker/index.ts", process.cwd());
  for (const f of ["lib/sources/index.ts", "lib/sources/coingecko.ts", "lib/ai/technote.ts", "config/sources.ts", "worker/lock.ts"]) assert.ok(files.includes(f), f);
  for (const f of ["lib/queries.ts", "lib/queries-macro.ts", "components/TopBar.tsx"]) assert.ok(!files.includes(f), f);
});

test("changedSince: files edited after the start, newest first; a deleted file counts as changed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "wh-mtime-"));
  try {
    const start = Date.now() - 60_000;
    const at = (f: string, ms: number) => {
      writeFileSync(path.join(root, f), "x");
      utimesSync(path.join(root, f), ms / 1000, ms / 1000);
    };
    at("old.ts", start - 1000);
    at("edited.ts", start + 1000);
    at("newer.ts", start + 5000);
    const r = changedSince(["old.ts", "edited.ts", "newer.ts", "gone.ts"], root, start);
    assert.deepEqual(r.changed, ["gone.ts", "newer.ts", "edited.ts"]);
    assert.ok(r.changedAt! > start + 5000);
    assert.deepEqual(changedSince(["old.ts"], root, start), { changed: [], changedAt: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workerHealth: down, started before self-reporting, missing sources, edited code, ok", () => {
  const now = Date.UTC(2026, 10, 11, 3);
  const known = ["yahoo", "fred", "technote"];
  const lock = { value: JSON.stringify({ pid: 42, host: "h" }), updated_at: now - 10_000 };
  const info = (over: Partial<WorkerInfo> = {}) => JSON.stringify({ pid: 42, startedAt: now - 3_600_000, sources: known, files: 100, changed: [], changedAt: null, ...over });

  assert.deepEqual(workerHealth(undefined, info(), known, now - 600_000, now), { state: "down", lastSeen: now - 600_000 });
  assert.deepEqual(workerHealth({ ...lock, updated_at: now - 300_000 }, info(), known, null, now), { state: "down", lastSeen: now - 300_000 });
  assert.deepEqual(workerHealth(undefined, null, known, null, now), { state: "down", lastSeen: null });

  const legacy = { state: "outdated", startedAt: null, unknown: [], changed: [] };
  assert.deepEqual(workerHealth(lock, null, known, null, now), legacy, "the worker of 2026-11-10 never wrote worker:info");
  assert.deepEqual(workerHealth(lock, info({ pid: 7 }), known, null, now), legacy, "a report left by an earlier worker");

  const old = workerHealth(lock, info({ sources: ["yahoo", "fred"] }), known, null, now);
  assert.deepEqual(old, { state: "outdated", startedAt: now - 3_600_000, unknown: ["technote"], changed: [] });
  const edited = workerHealth(lock, info({ changed: ["lib/sources/coingecko.ts"], changedAt: now - 60_000 }), known, null, now);
  assert.deepEqual(edited, { state: "outdated", startedAt: now - 3_600_000, unknown: [], changed: ["lib/sources/coingecko.ts"] });

  assert.deepEqual(workerHealth(lock, info({ sources: [...known, "retired"] }), known, null, now), { state: "ok", startedAt: now - 3_600_000 });
});

test("workerHealth: every SOURCE_META id is registered with the worker", async () => {
  const { sources } = await import("@/lib/sources");
  const ids = new Set<string>(sources.map((s) => s.id));
  assert.deepEqual(Object.keys(SOURCE_META).filter((id) => !ids.has(id)), [], "a source the web expects but the worker never schedules");
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
