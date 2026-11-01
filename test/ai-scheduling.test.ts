import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { brief, vnDate } from "@/lib/ai/brief";
import { FORCE_KEY } from "@/lib/ai/brief-shared";
import { needsNote } from "@/lib/ai/insights";

const H = 3600_000;
const MIN = 60_000;

test("needsNote: rewrite on a new reason or old age, not when a reason lapses", () => {
  const now = Date.now();
  const note = (basis: string, ageMs = H) => ({ basis, created_at: now - ageMs });
  assert.equal(needsNote([{ kind: "warn" }], undefined, now), true, "no note yet");
  assert.equal(needsNote([{ kind: "warn" }, { kind: "move", z: 2.3 }], note("move+warn"), now), false, "same reasons");
  assert.equal(needsNote([{ kind: "warn" }], note("move+warn"), now), false, "move faded");
  assert.equal(needsNote([{ kind: "warn" }, { kind: "move", z: -2.1 }], note("move+warn"), now), false, "move came back");
  assert.equal(needsNote([{ kind: "crit" }], note("warn"), now), true, "escalated to crit");
  assert.equal(needsNote([{ kind: "warn" }], note("crit"), now), false, "eased to warn");
  assert.equal(needsNote([{ kind: "high" }], note("warn"), now), true, "new 1-year high");
  assert.equal(needsNote([{ kind: "warn" }], note("warn", 13 * H), now), true, "older than 12 hours");
});

function briefDb(now: number, { briefAgeMs, articles }: { briefAgeMs: number; articles: number }) {
  const db = openDb(":memory:");
  const ins = db.prepare(
    "INSERT INTO articles (id, url, source, lang, title, title_key, published_at, fetched_at) VALUES (?, ?, 'BBC', 'en', ?, ?, ?, ?)",
  );
  for (let i = 0; i < articles; i++) ins.run(`a${i}`, `https://x.example/${i}`, `Headline ${i}`, `headline ${i}`, now - i * MIN, now);
  for (const lang of ["en", "vi"]) {
    db.prepare("INSERT INTO briefs (date, lang, content, created_at) VALUES (?, ?, '{}', ?)").run(vnDate(now), lang, now - briefAgeMs);
  }
  return db;
}

const force = (db: ReturnType<typeof openDb>, at: number) =>
  db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, '1', ?)").run(FORCE_KEY, at);

test("brief.isDue: today's brief exists and nothing was requested", () => {
  const now = Date.now();
  assert.equal(brief.isDue!(now, undefined, briefDb(now, { briefAgeMs: 2 * H, articles: 20 })), false);
});

test("brief.isDue: a Regenerate request waits until the last brief is 10 minutes old", () => {
  const now = Date.now();
  const db = briefDb(now, { briefAgeMs: 5 * MIN, articles: 20 });
  force(db, now);
  assert.equal(brief.isDue!(now, undefined, db), false, "5 minutes after the last brief");
  assert.equal(brief.isDue!(now + 6 * MIN, undefined, db), true, "11 minutes after the last brief");
});

test("brief.isDue: no rewrite after a recent failure or with too few headlines", () => {
  const now = Date.now();
  const db = briefDb(now, { briefAgeMs: 2 * H, articles: 20 });
  force(db, now);
  const failed = { source: "brief", ok: 0, error: "429", count: 0, last_run: now - 10 * MIN, last_ok: null };
  assert.equal(brief.isDue!(now, failed, db), false, "failed 10 minutes ago");
  assert.equal(brief.isDue!(now, undefined, db), true, "same request without the failure");

  const sparse = briefDb(now, { briefAgeMs: 2 * H, articles: 5 });
  force(sparse, now);
  assert.equal(brief.isDue!(now, undefined, sparse), false, "too few headlines");
});
