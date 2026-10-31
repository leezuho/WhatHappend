import { SERIES } from "@/config/series";
import { getDb } from "@/lib/db";
import { forbidden, isCrossOrigin } from "@/lib/same-origin";

export async function POST(request: Request) {
  if (isCrossOrigin(request)) return forbidden();
  const body = (await request.json().catch(() => null)) as { key?: string; on?: boolean } | null;
  if (!body?.key || !(body.key in SERIES)) return Response.json({ error: "unknown series" }, { status: 400 });
  const db = getDb();
  if (body.on) db.prepare("INSERT OR IGNORE INTO watchlist (series_id, added_at) VALUES (?, ?)").run(body.key, Date.now());
  else db.prepare("DELETE FROM watchlist WHERE series_id = ?").run(body.key);
  return Response.json({ ok: true });
}
