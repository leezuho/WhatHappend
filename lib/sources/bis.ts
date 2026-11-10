import { SOURCE_META } from "@/config/sources";
import { COUNTRIES, MACRO_COUNTRIES } from "@/config/countries";
import { bisId, type BisCode } from "@/config/macro";
import { periodTs } from "./oecd";
import { fetchText, parseCsv } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// BIS statistics API (SDMX, CSV, no key): central-bank policy rates (WS_CBPOL,
// daily) for every tracked country, plus the macro page's real effective
// exchange rates (WS_EER, monthly, broad basket) and credit-to-GDP gaps
// (WS_CREDIT_GAP, quarterly, private non-financial sector, all lenders).
// The policy rates are the core of this source: if they fail, the run fails.

interface Query {
  code: BisCode | "CBPOL";
  url: (areas: string) => string;
  areas: string[];
  /** Stored series id per BIS area. */
  id: (area: string) => string;
}

const BASE = "https://stats.bis.org/api/v1/data";
const macroAreas = [...new Set(MACRO_COUNTRIES.flatMap((c) => (c.bisArea ? [c.bisArea] : [])))];

const QUERIES: Query[] = [
  {
    code: "CBPOL",
    areas: [...new Set(COUNTRIES.flatMap((c) => (c.bis ? [c.bis] : [])))],
    url: (a) => `${BASE}/WS_CBPOL/D.${a}?lastNObservations=1200&format=csv&detail=dataonly`,
    id: (a) => `bis:${a}`,
  },
  // Ten years of months, so the page can compare today's level with the decade's average.
  {
    code: "REER",
    areas: macroAreas,
    url: (a) => `${BASE}/WS_EER/M.R.B.${a}?lastNObservations=130&format=csv&detail=dataonly`,
    id: (a) => bisId("REER", a),
  },
  {
    code: "GAP",
    areas: macroAreas,
    url: (a) => `${BASE}/WS_CREDIT_GAP/Q.${a}.P.A.C?lastNObservations=40&format=csv&detail=dataonly`,
    id: (a) => bisId("GAP", a),
  },
];

/** "2026-11-06" (daily) or a monthly/quarterly period → UTC ms; null for anything else. */
function bisTs(period: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return Date.parse(`${period}T00:00:00Z`);
  return periodTs(period);
}

/** BIS CSV (detail=dataonly) → sorted points per area. The area column is REF_AREA, or BORROWERS_CTY in the credit dataflows. */
export function parseBisCsv(text: string): Map<string, Point[]> {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const iArea = header.includes("REF_AREA") ? header.indexOf("REF_AREA") : header.indexOf("BORROWERS_CTY");
  const iTime = header.indexOf("TIME_PERIOD");
  const iVal = header.indexOf("OBS_VALUE");
  if (iArea < 0 || iTime < 0 || iVal < 0) throw new Error(`unexpected BIS header: ${header.join(",")}`);
  const out = new Map<string, Point[]>();
  for (const r of rows.slice(1)) {
    const value = Number(r[iVal]);
    const ts = bisTs(r[iTime] ?? "");
    if (!r[iVal] || !Number.isFinite(value) || ts === null) continue;
    const list = out.get(r[iArea]) ?? [];
    list.push({ ts, value });
    out.set(r[iArea], list);
  }
  for (const list of out.values()) list.sort((a, b) => a.ts - b.ts);
  return out;
}

export const bis: Source = {
  id: "bis",
  ...SOURCE_META.bis,
  async run({ db, log }) {
    let written = 0;
    const failed: string[] = [];
    for (const q of QUERIES) {
      try {
        const byArea = parseBisCsv(await fetchText(q.url(q.areas.join("+")), { timeoutMs: 60_000 }));
        if (!byArea.size) throw new Error("no observations");
        for (const [area, points] of byArea) written += upsertSeries(db, q.id(area), "bis", points);
        const missing = q.areas.filter((a) => !byArea.has(a));
        if (missing.length) log(`${q.code}: nothing for ${missing.join(", ")}`);
      } catch (err) {
        if (q.code === "CBPOL") throw err;
        failed.push(`${q.code}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (failed.length) log(`failed: ${failed.join(" | ")}`);
    if (failed.length > QUERIES.length / 2) throw new Error(`${failed.length}/${QUERIES.length} BIS queries failed: ${failed.join(" | ")}`);
    return written;
  },
};
