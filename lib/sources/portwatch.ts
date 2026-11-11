import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { CHOKEPOINTS, chokepointId } from "@/config/geopolitics";
import { fetchJson } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Ships through the world's sea chokepoints a day, counted by the IMF's PortWatch
// from satellite AIS positions (ArcGIS feature service, no key). The table starts
// in 2019 and is updated weekly, a few days behind. History is kept from 2023 so
// the sparkline shows the Red Sea's fall in early 2024 as well as today's.

const URL = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
const START = "2023-01-01";
/** Each run re-reads this far back from the oldest latest point, in case PortWatch revises recent days. */
const OVERLAP_DAYS = 21;
/** Newest day older than this: PortWatch has stopped updating. */
const MAX_LAG_DAYS = 21;
const PAGE = 1000; // the service's maxRecordCount
const DAY = 86_400_000;

const Resp = z.object({
  features: z
    .array(z.object({ attributes: z.object({ date: z.string(), portid: z.string(), n_total: z.number().nullable(), n_tanker: z.number().nullable() }) }))
    .optional(),
  exceededTransferLimit: z.boolean().optional(),
  error: z.object({ message: z.string() }).optional(),
});

/** "2026-11-08" → midnight UTC. */
function dayOf(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) throw new Error(`PortWatch date not understood: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const portwatch: Source = {
  id: "portwatch",
  ...SOURCE_META.portwatch,
  async run({ db, log }) {
    const ids = CHOKEPOINTS.map((c) => c.id);
    // Read from where the stored history ends; a chokepoint added to the config later pulls the whole history.
    const latest = db.prepare("SELECT MAX(ts) AS ts FROM observations WHERE series_id = ?");
    const ends = ids.map((id) => (latest.get(chokepointId(id)) as { ts: number | null }).ts);
    const from = ends.some((t) => t === null) ? START : new Date(Math.min(...(ends as number[])) - OVERLAP_DAYS * DAY).toISOString().slice(0, 10);

    const where = `portid IN (${ids.map((id) => `'${id}'`).join(",")}) AND date >= DATE '${from}'`;
    const total = new Map<string, Point[]>(ids.map((id) => [id, []]));
    const tanker = new Map<string, Point[]>(ids.map((id) => [id, []]));
    for (let offset = 0; ; offset += PAGE) {
      const params = new URLSearchParams({
        where,
        outFields: "date,portid,n_total,n_tanker",
        orderByFields: "date,portid",
        returnGeometry: "false",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE),
        f: "json",
      });
      const r = await fetchJson(`${URL}?${params}`, Resp, { timeoutMs: 60_000 });
      if (r.error || !r.features) throw new Error(`PortWatch: ${r.error?.message ?? "no features in the response"}`);
      for (const { attributes: a } of r.features) {
        const ts = dayOf(a.date);
        if (a.n_total !== null) total.get(a.portid)?.push({ ts, value: a.n_total });
        if (a.n_tanker !== null) tanker.get(a.portid)?.push({ ts, value: a.n_tanker });
      }
      if (!r.exceededTransferLimit) break;
      if (offset > 50 * PAGE) throw new Error("PortWatch: too many pages");
    }

    const missing = ids.filter((id) => !total.get(id)!.length);
    if (missing.length) throw new Error(`PortWatch returned no days since ${from} for ${missing.join(", ")}`);
    const newest = Math.max(...[...total.values()].map((pts) => pts[pts.length - 1].ts));
    if (Date.now() - newest > MAX_LAG_DAYS * DAY) throw new Error(`PortWatch data stops at ${new Date(newest).toISOString().slice(0, 10)}`);

    let written = 0;
    for (const id of ids) {
      written += upsertSeries(db, chokepointId(id), "portwatch", total.get(id)!);
      written += upsertSeries(db, chokepointId(id, "tanker"), "portwatch", tanker.get(id)!);
    }
    log(`from ${from}, newest ${new Date(newest).toISOString().slice(0, 10)}`);
    return written;
  },
};
