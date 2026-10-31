import { SERIES, type SeriesKey } from "@/config/series";
import { getDb } from "@/lib/db";
import { getDetailPoints } from "@/lib/data/series";

export async function GET(request: Request, ctx: RouteContext<"/api/series/[key]">) {
  const { key } = await ctx.params;
  if (!(key in SERIES)) return Response.json({ error: "unknown series" }, { status: 404 });
  const days = Math.min(3650, Math.max(7, Number(new URL(request.url).searchParams.get("days")) || 730));
  return Response.json({ points: getDetailPoints(getDb(), SERIES[key as SeriesKey], days) });
}
