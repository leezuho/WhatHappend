import { getDb } from "@/lib/db";
import { FORCE_KEY } from "@/lib/ai/brief-shared";

// Ask the worker to (re)write the daily brief. The web server never calls
// Claude itself; it only raises a flag the worker picks up on its next tick.
export async function POST() {
  const now = Date.now();
  getDb().prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(FORCE_KEY, "1", now);
  return Response.json({ requestedAt: now });
}
