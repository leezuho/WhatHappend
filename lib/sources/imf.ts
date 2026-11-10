import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { COUNTRIES, IMF_GROUPS, IMF_INDICATORS } from "@/config/countries";
import { WORLD_MAP } from "@/config/macro";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// IMF World Economic Outlook via DataMapper: annual inflation, real GDP growth,
// unemployment, government debt and balance, current account, actuals plus
// forecasts, for our countries and the world aggregates. The API ignores
// country filters and always returns every economy, so we filter here: the
// world map's indicators (WORLD_MAP) are kept for every economy, last year to next.
// Akamai answers curl with 403 but lets Node's fetch through.

// Some economies come back as null instead of a year map.
const Years = z.record(z.string(), z.number().nullable()).nullable();
const Resp = z.object({ values: z.record(z.string(), z.record(z.string(), Years).nullable()) });

const AREAS = new Set([...COUNTRIES.map((c) => c.imf), ...IMF_GROUPS]);
/** The world map's indicators are kept for every economy too, but only around this year. */
const MAP_INDICATORS = new Set<string>(WORLD_MAP.map((m) => m.ind));

export const imf: Source = {
  id: "imf",
  ...SOURCE_META.imf,
  async run({ db, log }) {
    let written = 0;
    const failed: string[] = [];
    for (const ind of IMF_INDICATORS) {
      try {
        const data = await fetchJson(`https://www.imf.org/external/datamapper/api/v1/${ind}`, Resp, { timeoutMs: 60_000 });
        const byArea = data.values[ind] ?? {};
        const thisYear = new Date().getUTCFullYear();
        for (const [area, years] of Object.entries(byArea)) {
          const ours = AREAS.has(area);
          if (!years || (!ours && !MAP_INDICATORS.has(ind))) continue;
          const [from, to] = ours ? [2010, Infinity] : [thisYear - 1, thisYear + 1];
          const points = Object.entries(years).flatMap(([year, value]) =>
            value === null || Number(year) < from || Number(year) > to ? [] : [{ ts: Date.UTC(Number(year), 0, 1), value }],
          );
          if (points.length) written += upsertSeries(db, `imf:${ind}:${area}`, "imf", points);
        }
      } catch (err) {
        failed.push(`${ind}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (failed.length) log(`failed: ${failed.join(" | ")}`);
    if (failed.length > IMF_INDICATORS.length / 2) throw new Error(`${failed.length} IMF indicators failed`);
    return written;
  },
};
