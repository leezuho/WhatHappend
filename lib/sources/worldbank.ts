import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { WB_GDP_AREAS } from "@/config/countries";
import { fetchJson } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// World Bank Global Economic Monitor (API source 15, no key): quarterly real
// GDP, seasonally adjusted, in constant local currency, for the macro-page
// economies OECD has no quarterly accounts for (Vietnam). We store its growth
// over the same quarter a year earlier, the measure OECD's series gives the
// other countries. GEM runs about a quarter behind the national release.

// GEM leaves countryiso3code empty and puts the ISO3 code in country.id.
const Row = z.object({ country: z.object({ id: z.string() }), date: z.string(), value: z.number().nullable() });
const Resp = z.tuple([z.object({ total: z.number() }).passthrough(), z.array(Row).nullable()]);

/** "2026Q2" → 1 Apr 2026 UTC; null for anything else. */
function quarterTs(date: string): number | null {
  const m = /^(\d{4})Q([1-4])$/.exec(date);
  return m ? Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 3, 1) : null;
}

/** GEM rows of one country → % change of each quarter over the same quarter a year earlier, oldest first. */
export function gdpGrowth(rows: z.infer<typeof Row>[]): Point[] {
  const level = new Map<number, number>();
  for (const r of rows) {
    const ts = quarterTs(r.date);
    if (ts !== null && r.value !== null && r.value > 0) level.set(ts, r.value);
  }
  return [...level]
    .flatMap(([ts, v]) => {
      const d = new Date(ts);
      const before = level.get(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1));
      return before ? [{ ts, value: (v / before - 1) * 100 }] : [];
    })
    .sort((a, b) => a.ts - b.ts);
}

export const worldbank: Source = {
  id: "worldbank",
  ...SOURCE_META.worldbank,
  async run({ db }) {
    if (!WB_GDP_AREAS.length) return 0;
    const url = `https://api.worldbank.org/v2/country/${WB_GDP_AREAS.join(";")}/indicator/NYGDPMKTPSAKN?source=15&format=json&frequency=Q&mrv=24&per_page=500`;
    const [, rows] = await fetchJson(url, Resp, { timeoutMs: 60_000 });
    let written = 0;
    for (const area of WB_GDP_AREAS) {
      const points = gdpGrowth((rows ?? []).filter((r) => r.country.id === area));
      if (!points.length) throw new Error(`no quarterly GDP for ${area} in the World Bank GEM`);
      written += upsertSeries(db, `wb:GDP:${area}`, "worldbank", points);
    }
    return written;
  },
};
