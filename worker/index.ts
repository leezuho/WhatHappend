import { getDb } from "@/lib/db";
import { aiStatus } from "@/lib/ai/config";
import { sources } from "@/lib/sources";
import { isDue, missingEnv, runSource } from "@/lib/sources/runner";
import { acquireWorkerLock, refreshWorkerLock, releaseWorkerLock } from "./lock";

// Long-running scheduler: every tick, start each source that is due and not
// already running. "Due" is computed from source_status in the DB, so restarting
// the worker does not re-hit every API at once.

const TICK_MS = 20_000;
/** A lock whose heartbeat is older than this belongs to a worker that died. */
const LOCK_STALE_MS = 3 * TICK_MS;
const db = getDb();
const running = new Set<string>();

function stamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function errText(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

const lock = acquireWorkerLock(db, LOCK_STALE_MS);
if (!lock.ok) {
  console.error(`${stamp()} another worker is already running on this database (pid ${lock.holder.pid} on ${lock.holder.host}); exiting`);
  process.exit(1);
}

// The scheduler must outlive one bad run: a stray rejection is logged, not fatal.
process.on("unhandledRejection", (err) => console.error(`${stamp()} unhandled rejection: ${errText(err)}`));

for (const s of sources) {
  const missing = missingEnv(s);
  if (missing.length) console.log(`${stamp()} skip ${s.id}: ${missing.join("; ")}`);
}

function tick() {
  if (!refreshWorkerLock(db)) {
    console.error(`${stamp()} another worker took over the lock; exiting`);
    shutdown(1);
    return;
  }
  for (const source of sources) {
    if (running.has(source.id) || missingEnv(source).length) continue;
    try {
      if (!isDue(source, db)) continue;
    } catch (err) {
      console.error(`${stamp()} FAIL ${source.id}: due check: ${errText(err)}`);
      continue;
    }
    running.add(source.id);
    runSource(source, db, (m) => console.log(`${stamp()} ${m}`))
      .then((r) => {
        const line = r.ok ? `ok   ${r.id} (${r.count} rows, ${r.durationMs}ms)` : `FAIL ${r.id}: ${r.error}`;
        console.log(`${stamp()} ${line}`);
      })
      // runSource catches the source's own errors; this catches failures to record them (e.g. SQLITE_BUSY).
      .catch((err) => console.error(`${stamp()} FAIL ${source.id}: ${errText(err)}`))
      .finally(() => running.delete(source.id));
  }
}

function safeTick() {
  try {
    tick();
  } catch (err) {
    console.error(`${stamp()} tick failed: ${errText(err)}`);
  }
}

const timer = setInterval(safeTick, TICK_MS);
let stopping = false;

function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  try {
    releaseWorkerLock(db);
    db.close();
  } catch (err) {
    console.error(`${stamp()} shutdown: ${errText(err)}`);
  }
  // Runs still in flight are dropped; their last_run is unchanged, so they rerun on the next start.
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const ai = aiStatus();
console.log(`${stamp()} worker started with ${sources.length} sources; AI: ${ai.ok ? `${ai.config.provider} (brief ${ai.config.models.brief}, fast ${ai.config.models.fast})` : "off"}`);
safeTick();
