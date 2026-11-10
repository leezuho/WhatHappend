import { SOURCE_META } from "@/config/sources";
import { MACRO_COUNTRIES } from "@/config/countries";
import { oecdId, type OecdCode } from "@/config/macro";
import { fetchText, parseCsv } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// OECD Data Explorer (SDMX REST, CSV, no key): leading indicator, CPI
// inflation, unemployment, quarterly GDP growth, 10-year yields and business
// and consumer confidence for the macro page's countries. One query per indicator covers every country.
// The API is rate limited and answers both an over-eager client and a bad key
// with HTTP 500, so the worker calls it once a day, pausing between queries.
// It also answers 500 to "Accept-Language: *", which Node's fetch sends by
// default (curl sends none), so every request names a language.
// Keys list every dimension (an empty slot is a wildcard) and must pin exactly
// one series per country. Codes come from each dataflow's content constraint
// (GET /public/rest/dataflow/<agency>/<flow>/latest?references=all), which the
// rate limit does not count as a data download; see TechDesign/LLDD/02-data-sources.md.

interface Dataset {
  code: OecdCode;
  flow: string;
  key: (areas: string) => string;
  /** Our area code → this dataflow's, where they differ (the euro area is EA20 in some, EA in others). */
  alias?: Record<string, string>;
  /** Areas this dataflow does not cover; an unknown code risks failing the whole query. */
  skip?: string[];
}

const DATASETS: Dataset[] = [
  // Composite leading indicator, amplitude adjusted index (100 = trend). The OECD publishes none for the euro area.
  { code: "CLI", flow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: (a) => `${a}.M.LI.IX._Z.AA.IX._Z.H`, skip: ["EA20"] },
  // CPI, all items, national definition, % change over a year. Japan is not in this dataflow (checked 2026-11-09).
  { code: "CPI", flow: "OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,", key: (a) => `${a}.M.N.CPI.PA._T.N.GY` },
  // Unemployment rate, % of labour force, seasonally adjusted, 15+. No monthly series for CN, IN, ID, BR.
  {
    code: "UNE",
    flow: "OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,",
    key: (a) => `${a}.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.M`,
    alias: { EA20: "EA" },
    skip: ["CHN", "IND", "IDN", "BRA"],
  },
  // Real GDP (chain-linked volume, price base L), % change over the same quarter a year earlier.
  {
    code: "GDP",
    flow: "OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,",
    key: (a) => `Q.Y.${a}.S1.S1.B1GQ._Z...PC.L.GY.T0102`,
    alias: { EA20: "EA" },
  },
  // Long-term (10-year) government bond yield, % a year, monthly average.
  { code: "IRLT", flow: "OECD.SDD.STES,DSD_STES@DF_FINMARK,", key: (a) => `${a}.M.IRLT.PA._Z._Z._Z._Z.N` },
  // Business and consumer confidence, amplitude adjusted (100 = long-run average), same dataflow as the CLI.
  { code: "BCI", flow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: (a) => `${a}.M.BCICP.IX._Z.AA.IX._Z.H` },
  { code: "CCI", flow: "OECD.SDD.STES,DSD_STES@DF_CLI,", key: (a) => `${a}.M.CCICP.IX._Z.AA.IX._Z.H` },
];

const PAUSE_MS = 4000;
const YEARS_BACK = 3;

/** "2026-09" or "2026-M09" (IMF) → 1 Sep, "2026-Q2" → 1 Apr, "2026" → 1 Jan (UTC); null for anything else. */
export function periodTs(period: string): number | null {
  let m = /^(\d{4})-M?(\d{2})$/.exec(period);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
  m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (m) return Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 3, 1);
  m = /^(\d{4})$/.exec(period);
  if (m) return Date.UTC(Number(m[1]), 0, 1);
  return null;
}

/**
 * SDMX-CSV (format=csvfile) → sorted points per REF_AREA. The columns between
 * DATAFLOW and TIME_PERIOD name the series; a country with two different
 * series means the key is too loose, which fails loudly rather than mixing them.
 */
export function parseSdmxCsv(text: string): Map<string, Point[]> {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const iArea = header.indexOf("REF_AREA");
  const iTime = header.indexOf("TIME_PERIOD");
  const iVal = header.indexOf("OBS_VALUE");
  if (iArea < 0 || iTime < 0 || iVal < 0) throw new Error(`unexpected OECD header: ${header.slice(0, 12).join(",")}`);
  const seriesOf = new Map<string, string>();
  const out = new Map<string, Point[]>();
  for (const r of rows.slice(1)) {
    const area = r[iArea];
    const ts = periodTs(r[iTime] ?? "");
    const value = Number(r[iVal]);
    if (!area || ts === null || !r[iVal] || !Number.isFinite(value)) continue;
    const series = r.slice(1, iTime).join(".");
    const known = seriesOf.get(area);
    if (known === undefined) seriesOf.set(area, series);
    else if (known !== series) throw new Error(`key matches several series for ${area}: ${known} and ${series}`);
    const list = out.get(area) ?? [];
    list.push({ ts, value });
    out.set(area, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.ts - b.ts);
  return out;
}

export const oecd: Source = {
  id: "oecd",
  ...SOURCE_META.oecd,
  async run({ db, log }) {
    const areas = MACRO_COUNTRIES.flatMap((c) => (c.oecd ? [c.oecd] : []));
    const start = `${new Date().getUTCFullYear() - YEARS_BACK}-01`;
    let written = 0;
    const failed: string[] = [];
    for (const [i, ds] of DATASETS.entries()) {
      if (i) await new Promise((r) => setTimeout(r, PAUSE_MS));
      try {
        const ours = areas.filter((a) => !ds.skip?.includes(a));
        const theirs = (a: string) => ds.alias?.[a] ?? a;
        const url = `https://sdmx.oecd.org/public/rest/data/${ds.flow}/${ds.key(ours.map(theirs).join("+"))}?startPeriod=${start}&format=csvfile`;
        const byArea = parseSdmxCsv(await fetchText(url, { timeoutMs: 90_000, headers: { "Accept-Language": "en" } }));
        if (!byArea.size) throw new Error("no observations");
        // Stored under our own area code, so the page reads oecd:<code>:EA20 whatever the dataflow calls it.
        for (const a of ours) {
          const points = byArea.get(theirs(a));
          if (points) written += upsertSeries(db, oecdId(ds.code, a), "oecd", points);
        }
        const missing = ours.filter((a) => !byArea.has(theirs(a)));
        if (missing.length) log(`${ds.code}: nothing for ${missing.join(", ")}`);
      } catch (err) {
        failed.push(`${ds.code}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (failed.length) log(`failed: ${failed.join(" | ")}`);
    if (failed.length > DATASETS.length / 2) throw new Error(`${failed.length}/${DATASETS.length} OECD queries failed`);
    return written;
  },
};
