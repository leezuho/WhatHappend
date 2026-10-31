import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { CITIES } from "@/config/cities";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Current air quality for a fixed set of cities from Open-Meteo (keyless; one
// call, results come back as an array in input order). OpenAQ now needs a key.

const Loc = z.object({
  current: z.object({ time: z.string(), us_aqi: z.number().nullish(), pm2_5: z.number().nullish(), pm10: z.number().nullish() }),
});
const Resp = z.union([z.array(Loc), Loc]);

export const airquality: Source = {
  id: "airquality",
  ...SOURCE_META.airquality,
  async run({ db }) {
    const params = new URLSearchParams({
      latitude: CITIES.map((c) => c.lat).join(","),
      longitude: CITIES.map((c) => c.lng).join(","),
      current: "us_aqi,pm2_5,pm10",
      timezone: "GMT",
    });
    const r = await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, Resp);
    const list = Array.isArray(r) ? r : [r];
    if (list.length !== CITIES.length) throw new Error(`expected ${CITIES.length} locations, got ${list.length}`);
    return replaceItems(
      db,
      "airquality",
      CITIES.map((c, i) => ({
        id: c.key,
        title: c.en,
        titleVi: c.vi,
        ts: Date.parse(`${list[i].current.time}Z`) || Date.now(),
        data: { aqi: list[i].current.us_aqi ?? null, pm25: list[i].current.pm2_5 ?? null, pm10: list[i].current.pm10 ?? null },
      })),
    );
  },
};
