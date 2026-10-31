import { getDb } from "@/lib/db";
import { aiStatus } from "@/lib/ai/config";
import { sources } from "@/lib/sources";
import { isDue, missingEnv, runSource } from "@/lib/sources/runner";

// Long-running scheduler: every tick, start each source that is due and not
// already running. "Due" is computed from source_status in the DB, so restarting
// the worker does not re-hit every API at once.

const TICK_MS = 20_000;
const db = getDb();
const running = new Set<string>();

function stamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

for (const s of sources) {
  const missing = missingEnv(s);
  if (missing.length) console.log(`${stamp()} skip ${s.id}: ${missing.join("; ")}`);
}

async function tick() {
  for (const source of sources) {
    if (running.has(source.id) || missingEnv(source).length || !isDue(source, db)) continue;
    running.add(source.id);
    runSource(source, db, (m) => console.log(`${stamp()} ${m}`))
      .then((r) => {
        const line = r.ok ? `ok   ${r.id} (${r.count} rows, ${r.durationMs}ms)` : `FAIL ${r.id}: ${r.error}`;
        console.log(`${stamp()} ${line}`);
      })
      .finally(() => running.delete(source.id));
  }
}

const ai = aiStatus();
console.log(`${stamp()} worker started with ${sources.length} sources; AI: ${ai.ok ? `${ai.config.provider} (brief ${ai.config.models.brief}, fast ${ai.config.models.fast})` : "off"}`);
void tick();
setInterval(() => void tick(), TICK_MS);
