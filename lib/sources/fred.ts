import { SOURCE_META } from "@/config/sources";
import { FRED_CODES } from "@/config/series";
import { fetchText, parseCsv } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// FRED's public graph CSV needs no API key. One request per series: batching
// ids of mixed frequency makes FRED answer with a ZIP instead of a CSV.

const YEARS_BACK = 3;

export const fred: Source = {
  id: "fred",
  ...SOURCE_META.fred,
  async run({ db, log }) {
    const since = new Date(Date.now() - YEARS_BACK * 365 * 24 * 3600_000).toISOString().slice(0, 10);
    let written = 0;
    const failed: string[] = [];
    for (const code of [...new Set(FRED_CODES)]) {
      try {
        const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${code}&cosd=${since}`, { timeoutMs: 30_000 });
        const rows = parseCsv(csv);
        const header = rows[0] ?? [];
        if (header[0] !== "observation_date" || header[1] !== code) throw new Error(`unexpected header ${header.join(",")}`);
        const points = rows.slice(1).flatMap(([date, v]) => {
          const value = Number(v);
          return v && v !== "." && Number.isFinite(value) ? [{ ts: Date.parse(`${date}T00:00:00Z`), value }] : [];
        });
        written += upsertSeries(db, `fred:${code}`, "fred", points);
      } catch (err) {
        failed.push(`${code}: ${err instanceof Error ? err.message : err}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (failed.length) log(`failed: ${failed.join(" | ")}`);
    if (failed.length > FRED_CODES.length / 2) throw new Error(`${failed.length} FRED series failed`);
    return written;
  },
};
