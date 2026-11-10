import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Geomagnetic storms from NOAA's Space Weather Prediction Center (keyless
// JSON): the planetary Kp index every 3 hours, observed for the past week and
// forecast for the next three days, and today's NOAA scales. Strong storms
// (G3+) disturb GPS, HF radio, satellites and power grids; G4–G5 bring the
// aurora far south.

const Kp = z.array(
  z.object({
    time_tag: z.string(),
    kp: z.number().nullish(),
    observed: z.string().nullish(),
    noaa_scale: z.string().nullish(),
  }),
);

const Scale = z.object({ Scale: z.string().nullish(), Text: z.string().nullish() });
const Scales = z.record(
  z.string(),
  z.object({
    DateStamp: z.string(),
    R: Scale.extend({ MinorProb: z.string().nullish(), MajorProb: z.string().nullish() }),
    S: Scale.extend({ Prob: z.string().nullish() }),
    G: Scale,
  }),
);

export interface KpPoint {
  /** Start of the 3-hour window, ms UTC. */
  ts: number;
  kp: number;
  /** Observed, estimated (the last hours) or predicted. */
  kind: "observed" | "estimated" | "predicted";
}

export interface SpaceWeather {
  kp: KpPoint[];
  /** Today's geomagnetic (G), radiation (S) and radio blackout (R) levels, 0–5. */
  today: { g: number; s: number; r: number };
  /** Chance of R1–R2 and R3+ radio blackouts in the next day, %. */
  radioProb: { minor: number | null; major: number | null };
}

export function kpPoints(rows: z.infer<typeof Kp>): KpPoint[] {
  return rows.flatMap((r) => {
    const ts = Date.parse(`${r.time_tag}Z`);
    if (r.kp === null || r.kp === undefined || !Number.isFinite(ts)) return [];
    const kind = r.observed === "predicted" ? "predicted" : r.observed === "estimated" ? "estimated" : "observed";
    return [{ ts, kp: r.kp, kind }];
  });
}

const num = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? null : Number(s));

export const spaceweather: Source = {
  id: "spaceweather",
  ...SOURCE_META.spaceweather,
  async run({ db }) {
    const [kp, scales] = await Promise.all([
      fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json", Kp),
      fetchJson("https://services.swpc.noaa.gov/products/noaa-scales.json", Scales),
    ]);
    const points = kpPoints(kp);
    if (!points.length) throw new Error("no Kp values");
    const now = scales["0"];
    const next = scales["1"];
    const data: SpaceWeather = {
      kp: points,
      today: { g: num(now?.G.Scale) ?? 0, s: num(now?.S.Scale) ?? 0, r: num(now?.R.Scale) ?? 0 },
      radioProb: { minor: num(next?.R.MinorProb), major: num(next?.R.MajorProb) },
    };
    return replaceItems(db, "spaceweather", [{ id: "noaa", title: "NOAA space weather", ts: Date.now(), data }]);
  },
};
