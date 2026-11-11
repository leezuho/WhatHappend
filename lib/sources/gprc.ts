import * as XLSX from "xlsx";
import { SOURCE_META } from "@/config/sources";
import { gprCountryId } from "@/config/geopolitics";
import { fetchBuffer } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Caldara & Iacoviello's monthly geopolitical risk by country (the `gpr` source
// reads the daily global index). Each GPRC_<ISO3> column is the share of
// newspaper articles about geopolitical tension that name the country. Shares
// are not comparable across countries (the US is named far more often than
// Vietnam), so each is stored as an index: 100 = the country's own 1985–2019
// average, the same base as the global index.

const URL = "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls";
const BASE_FROM = Date.UTC(1985, 0, 1);
const BASE_TO = Date.UTC(2019, 11, 1);
/** Months kept: enough for the heatmap and a few years of context. */
const KEEP_FROM = Date.UTC(2015, 0, 1);
const MIN_COUNTRIES = 30;
const MAX_LAG_DAYS = 100;

/** Excel's day number (1900 system) → the first of that month, UTC. */
export function excelMonth(serial: number): number {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Country columns of the workbook as indices (100 = 1985–2019 average). Rows carry `month` as an Excel day number;
 * a column without a usable base (missing or zero) is skipped.
 */
export function countryIndices(rows: Record<string, unknown>[], keepFrom = KEEP_FROM): Map<string, Point[]> {
  const codes = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (/^GPRC_[A-Z]{3}$/.test(k)) codes.add(k.slice(5));
  const out = new Map<string, Point[]>();
  for (const iso of codes) {
    const col = `GPRC_${iso}`;
    const pts = rows.flatMap((r) => (typeof r.month === "number" && typeof r[col] === "number" ? [{ ts: excelMonth(r.month), value: r[col] as number }] : []));
    const base = pts.filter((p) => p.ts >= BASE_FROM && p.ts <= BASE_TO);
    const mean = base.reduce((a, p) => a + p.value, 0) / base.length;
    if (!base.length || !(mean > 0)) continue;
    out.set(iso, pts.filter((p) => p.ts >= keepFrom).map((p) => ({ ts: p.ts, value: (p.value / mean) * 100 })));
  }
  return out;
}

export const gprc: Source = {
  id: "gprc",
  ...SOURCE_META.gprc,
  async run({ db }) {
    const wb = XLSX.read(await fetchBuffer(URL, { timeoutMs: 90_000 }), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    const indices = countryIndices(rows);
    if (indices.size < MIN_COUNTRIES) throw new Error(`only ${indices.size} GPRC_ country columns found (sheet layout changed?)`);
    const newest = Math.max(...[...indices.values()].map((pts) => pts[pts.length - 1]?.ts ?? 0));
    if (Date.now() - newest > MAX_LAG_DAYS * 86_400_000) throw new Error(`country GPR stops at ${new Date(newest).toISOString().slice(0, 7)}`);
    let written = 0;
    for (const [iso, pts] of indices) written += upsertSeries(db, gprCountryId(iso), "gprc", pts);
    return written;
  },
};
