import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { COUNTRIES, IMF_INDICATORS } from "@/config/countries";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// IMF World Economic Outlook via DataMapper: annual inflation (PCPIPCH) and real
// GDP growth (NGDP_RPCH), actuals plus forecasts. The API ignores country
// filters and always returns every economy, so we filter here.

// Some economies come back as null instead of a year map.
const Years = z.record(z.string(), z.number().nullable()).nullable();
const Resp = z.object({ values: z.record(z.string(), z.record(z.string(), Years).nullable()) });

export const imf: Source = {
  id: "imf",
  ...SOURCE_META.imf,
  async run({ db }) {
    let written = 0;
    for (const ind of IMF_INDICATORS) {
      const data = await fetchJson(`https://www.imf.org/external/datamapper/api/v1/${ind}`, Resp, { timeoutMs: 60_000 });
      const byCountry = data.values[ind] ?? {};
      for (const c of COUNTRIES) {
        const years = byCountry[c.imf];
        if (!years) continue;
        const points = Object.entries(years).flatMap(([year, value]) =>
          value === null || Number(year) < 2010 ? [] : [{ ts: Date.UTC(Number(year), 0, 1), value }],
        );
        written += upsertSeries(db, `imf:${ind}:${c.imf}`, "imf", points);
      }
    }
    return written;
  },
};
