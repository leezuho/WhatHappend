import type { DatabaseSync } from "node:sqlite";
import { aiStatus } from "@/lib/ai/config";
import type { Source, SourceStatusRow } from "./types";

export function getStatus(db: DatabaseSync, id: string): SourceStatusRow | undefined {
  return db.prepare("SELECT * FROM source_status WHERE source = ?").get(id) as SourceStatusRow | undefined;
}

/** What the source still needs before it can run (empty = ready). */
export function missingEnv(source: Source): string[] {
  const missing = (source.requiresEnv ?? []).filter((k) => !process.env[k]);
  if (source.needsAi) {
    const ai = aiStatus();
    if (!ai.ok) missing.push(ai.reason);
  }
  return missing;
}

export function isDue(source: Source, db: DatabaseSync, now = Date.now()): boolean {
  const status = getStatus(db, source.id);
  if (source.isDue) return source.isDue(now, status, db);
  if (!status) return true;
  // After a failure retry sooner (but not hammering): a quarter of the interval, min 1 minute.
  const wait = status.ok ? source.intervalMs : Math.max(60_000, source.intervalMs / 4);
  return now - status.last_run >= wait;
}

export interface RunResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
  durationMs: number;
  skipped?: boolean;
}

export async function runSource(source: Source, db: DatabaseSync, log = console.log): Promise<RunResult> {
  const missing = missingEnv(source);
  if (missing.length) {
    return { id: source.id, ok: false, count: 0, error: `not configured: ${missing.join("; ")}`, durationMs: 0, skipped: true };
  }
  const started = Date.now();
  let result: RunResult;
  try {
    const count = await source.run({ db, log: (m) => log(`[${source.id}] ${m}`) });
    result = { id: source.id, ok: true, count, durationMs: Date.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result = { id: source.id, ok: false, count: 0, error: error.slice(0, 500), durationMs: Date.now() - started };
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO source_status (source, ok, error, count, last_run, last_ok) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET ok = excluded.ok, error = excluded.error, count = excluded.count,
       last_run = excluded.last_run, last_ok = COALESCE(excluded.last_ok, source_status.last_ok)`,
  ).run(source.id, result.ok ? 1 : 0, result.error ?? null, result.count, now, result.ok ? now : null);
  db.prepare("INSERT INTO fetch_log (source, ok, count, error, duration_ms, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    source.id,
    result.ok ? 1 : 0,
    result.count,
    result.error ?? null,
    result.durationMs,
    now,
  );
  // Keep the log bounded.
  db.prepare("DELETE FROM fetch_log WHERE at < ?").run(now - 7 * 24 * 3600_000);
  return result;
}
