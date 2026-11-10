import { SOURCE_META } from "@/config/sources";
import { MACRO_COUNTRIES } from "@/config/countries";
import { imfCpiId } from "@/config/macro";
import { periodTs } from "./oecd";
import { fetchText, parseCsv } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Monthly CPI inflation (all items, % over a year) from the IMF's CPI dataset,
// SDMX REST at api.imf.org (CSV, no key), for every macro-page economy. OECD's
// price dataflow has no Japan or Vietnam and has stopped for the euro area,
// France, Italy and Mexico; the page reads whichever of the two runs later.
// The euro area is only published as HICP; elsewhere the national CPI wins
// over the HICP when both exist, like OECD's national-definition series.

const BASE = "https://api.imf.org/external/sdmx/2.1/data/IMF.STA,CPI";
const YEARS_BACK = 3;

/** Our DataMapper code → the CPI dataset's, where they differ. */
const AREA: Record<string, string> = { EURO: "G163" };
const theirs = (imf: string) => AREA[imf] ?? imf;

/** IMF SDMX-CSV (detail=dataonly) → sorted points per IMF area, national CPI preferred to HICP. */
export function parseImfCpiCsv(text: string): Map<string, Point[]> {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const [iArea, iType, iTime, iVal] = ["COUNTRY", "INDEX_TYPE", "TIME_PERIOD", "OBS_VALUE"].map((c) => header.indexOf(c));
  if (Math.min(iArea, iType, iTime, iVal) < 0) throw new Error(`unexpected IMF CPI header: ${header.slice(0, 10).join(",")}`);
  const byKey = new Map<string, Point[]>();
  for (const r of rows.slice(1)) {
    const ts = periodTs(r[iTime] ?? "");
    const value = Number(r[iVal]);
    if (ts === null || !r[iVal] || !Number.isFinite(value)) continue;
    const key = `${r[iArea]}|${r[iType]}`;
    const list = byKey.get(key) ?? [];
    list.push({ ts, value });
    byKey.set(key, list);
  }
  const out = new Map<string, Point[]>();
  for (const [key, points] of byKey) {
    const [area, type] = key.split("|");
    if (type !== "CPI" && byKey.has(`${area}|CPI`)) continue;
    out.set(area, points.sort((a, b) => a.ts - b.ts));
  }
  return out;
}

export const imfcpi: Source = {
  id: "imfcpi",
  ...SOURCE_META.imfcpi,
  async run({ db, log }) {
    const areas = MACRO_COUNTRIES.map((c) => c.imf);
    const start = `${new Date().getUTCFullYear() - YEARS_BACK}-01`;
    const url = `${BASE}/${areas.map(theirs).join("+")}.CPI+HICP._T.YOY_PCH_PA_PT.M?startPeriod=${start}&detail=dataonly`;
    const byArea = parseImfCpiCsv(
      await fetchText(url, { timeoutMs: 90_000, headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" } }),
    );
    if (!byArea.size) throw new Error("no IMF CPI observations");
    let written = 0;
    for (const a of areas) {
      const points = byArea.get(theirs(a));
      if (points) written += upsertSeries(db, imfCpiId(a), "imfcpi", points);
    }
    const missing = areas.filter((a) => !byArea.has(theirs(a)));
    if (missing.length) log(`nothing for ${missing.join(", ")}`);
    return written;
  },
};
