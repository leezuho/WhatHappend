import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceEvents, type EventRow } from "./store";
import type { Source } from "./types";

// GDACS (UN/EC Global Disaster Alert and Coordination System). Two windows:
// orange/red alerts of every hazard over 30 days, plus all-level cyclones,
// floods and volcanoes over 7 days. Without the alert filter wildfires drown
// everything else.

const Feature = z.object({
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullish(),
  properties: z.object({
    eventtype: z.string(),
    eventid: z.union([z.number(), z.string()]),
    name: z.string().nullish(),
    description: z.string().nullish(),
    alertlevel: z.string().nullish(),
    alertscore: z.number().nullish(),
    fromdate: z.string().nullish(),
    url: z.object({ report: z.string().nullish() }).passthrough().nullish(),
  }).passthrough(),
});
const Resp = z.object({ features: z.array(Feature).nullish() });

const TYPE: Record<string, string> = { TC: "cyclone", FL: "flood", VO: "volcano", DR: "drought", WF: "wildfire", EQ: "earthquake" };

/** Drought names list every affected country; keep map tooltips readable. */
function shorten(title: string, max = 90): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const comma = cut.lastIndexOf(",");
  return `${(comma > 40 ? cut.slice(0, comma) : cut).trim()}…`;
}

function ymd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function search(eventlist: string, days: number, alertlevel?: string) {
  const now = Date.now();
  const params = new URLSearchParams({ eventlist, fromdate: ymd(now - days * 24 * 3600_000), todate: ymd(now + 24 * 3600_000) });
  if (alertlevel) params.set("alertlevel", alertlevel);
  const r = await fetchJson(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${params}`, Resp, { timeoutMs: 30_000 });
  return r.features ?? [];
}

export const gdacs: Source = {
  id: "gdacs",
  ...SOURCE_META.gdacs,
  async run({ db }) {
    const [severe, recent] = await Promise.all([search("TC;FL;VO;DR;WF;EQ", 30, "Orange;Red"), search("TC;FL;VO", 7)]);
    const byId = new Map<string, EventRow>();
    for (const f of [...severe, ...recent]) {
      const p = f.properties;
      if (f.geometry?.type !== "Point" || !Array.isArray(f.geometry.coordinates)) continue;
      const [lng, lat] = f.geometry.coordinates as number[];
      const id = `gdacs:${p.eventtype}:${p.eventid}`;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        type: TYPE[p.eventtype] ?? p.eventtype.toLowerCase(),
        title: shorten(p.name?.trim() || p.description?.trim() || `${p.eventtype} ${p.eventid}`),
        lat,
        lng,
        severity: p.alertscore ?? null,
        level: p.alertlevel ? p.alertlevel.toLowerCase() : null,
        url: p.url?.report ?? null,
        ts: Date.parse(p.fromdate ?? "") || Date.now(),
      });
    }
    return replaceEvents(db, "gdacs", [...byId.values()]);
  },
};
