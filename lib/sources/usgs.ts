import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceEvents } from "./store";
import type { Source } from "./types";

const Feed = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        mag: z.number().nullable(),
        place: z.string().nullable(),
        time: z.number(),
        url: z.string(),
        alert: z.string().nullable(),
        tsunami: z.number(),
      }),
      geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
    }),
  ),
});

// PAGER alert colors map onto the same green/orange/red scale GDACS uses.
const LEVEL: Record<string, string> = { green: "green", yellow: "orange", orange: "orange", red: "red" };

export const usgs: Source = {
  id: "usgs",
  ...SOURCE_META.usgs,
  async run({ db }) {
    const feed = await fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson", Feed);
    return replaceEvents(
      db,
      "usgs",
      feed.features.map((f) => ({
        id: `usgs:${f.id}`,
        type: "earthquake",
        title: `M${f.properties.mag?.toFixed(1) ?? "?"} — ${f.properties.place ?? "Unknown location"}${f.properties.tsunami ? " (tsunami)" : ""}`,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        severity: f.properties.mag,
        level: f.properties.alert ? (LEVEL[f.properties.alert] ?? null) : null,
        url: f.properties.url,
        ts: f.properties.time,
      })),
    );
  },
};
