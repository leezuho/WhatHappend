import { getDb } from "@/lib/db";
import { FORCE_KEY } from "@/lib/ai/brief-shared";
import { forbidden, isCrossOrigin } from "@/lib/same-origin";

// Ask the worker to (re)write the daily brief. The web server never calls
// the AI itself; it only raises a flag the worker picks up on a later tick
// (at most one forced rewrite every few minutes, see lib/ai/brief.ts).
export async function POST(request: Request) {
  if (isCrossOrigin(request)) return forbidden();
  const now = Date.now();
  getDb().prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(FORCE_KEY, "1", now);
  return Response.json({ requestedAt: now });
}
