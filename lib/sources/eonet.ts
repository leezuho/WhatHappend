import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceEvents, type EventRow } from "./store";
import type { Source } from "./types";

// NASA EONET open natural events. Storms carry a track of points; we plot the
// latest one. The response is JSON even though its content-type says RSS.

const Resp = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      link: z.string().nullish(),
      categories: z.array(z.object({ id: z.string() })),
      sources: z.array(z.object({ url: z.string().nullish() })).nullish(),
      geometry: z.array(
        z.object({ date: z.string(), type: z.string(), coordinates: z.unknown(), magnitudeValue: z.number().nullish() }),
      ),
    }),
  ),
});

const TYPE: Record<string, string> = {
  wildfires: "wildfire",
  severeStorms: "storm",
  volcanoes: "volcano",
  floods: "flood",
  drought: "drought",
  landslides: "landslide",
  tempExtremes: "heat",
  earthquakes: "earthquake",
};

export const eonet: Source = {
  id: "eonet",
  ...SOURCE_META.eonet,
  async run({ db }) {
    const r = await fetchJson("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30", Resp, { timeoutMs: 30_000 });
    const events: EventRow[] = r.events.flatMap((e) => {
      const type = TYPE[e.categories[0]?.id ?? ""];
      if (!type) return [];
      const points = e.geometry.filter((g) => g.type === "Point" && Array.isArray(g.coordinates));
      const last = points[points.length - 1];
      if (!last) return [];
      const [lng, lat] = last.coordinates as number[];
      return [
        {
          id: `eonet:${e.id}`,
          type,
          title: e.title,
          lat,
          lng,
          severity: last.magnitudeValue ?? null,
          level: null,
          url: e.sources?.[0]?.url ?? e.link ?? null,
          ts: Date.parse(last.date) || Date.now(),
        },
      ];
    });
    return replaceEvents(db, "eonet", events);
  },
};
