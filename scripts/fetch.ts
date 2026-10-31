import { getDb } from "@/lib/db";
import { sources } from "@/lib/sources";
import { runSource } from "@/lib/sources/runner";

// Usage: npm run fetch -- <source-id> [more ids]   |   npm run fetch -- all
const args = process.argv.slice(2);
if (!args.length) {
  console.log("Usage: npm run fetch -- <source-id...> | all\n\nSources:\n" + sources.map((s) => `  ${s.id}`).join("\n"));
  process.exit(1);
}

const selected = args[0] === "all" ? sources : sources.filter((s) => args.includes(s.id));
const unknown = args.filter((a) => a !== "all" && !sources.some((s) => s.id === a));
if (unknown.length) {
  console.error(`Unknown source(s): ${unknown.join(", ")}`);
  process.exit(1);
}

async function main() {
  const db = getDb();
  let failed = 0;
  for (const source of selected) {
    const r = await runSource(source, db);
    if (r.skipped) console.log(`skip ${r.id}: ${r.error}`);
    else if (r.ok) console.log(`ok   ${r.id}: ${r.count} rows in ${r.durationMs}ms`);
    else {
      failed++;
      console.log(`FAIL ${r.id}: ${r.error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
