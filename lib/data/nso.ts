import type { DatabaseSync } from "node:sqlite";
import { NSO_SINCE, nsoId } from "@/config/nso";
import type { Point } from "@/lib/sources/store";

// Read side of Vietnam's monthly figures (lib/sources/nso.ts writes them):
// the record of which report each month came from, and what the Vietnam
// page's panel shows. No Next imports, so the worker can use it too.

export const NSO_REPORTS_KEY = "nso:reports";

/** What was read from one report, kept in kv `nso:reports` under "YYYY-MM". */
export interface ReportRecord {
  id: number;
  link: string;
  title: string;
  /** Publication date, YYYY-MM-DD. */
  published?: string;
  model?: string;
  /** When it was read. */
  at: number;
  kept: string[];
  /** Fields the model left empty (normal for quarter-only figures). */
  missing: string[];
  /** Fields given but rejected by the checks, with the reason. */
  dropped: Record<string, string>;
  /** Fields computed from others (the trade balance as exports − imports), not read. */
  derived?: string[];
  attempts?: number;
  error?: string;
}
export type ReportRecords = Record<string, ReportRecord>;

export const ymKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export function readReports(db: DatabaseSync): ReportRecords {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(NSO_REPORTS_KEY) as { value: string | null } | undefined;
  try {
    return row?.value ? (JSON.parse(row.value) as ReportRecords) : {};
  } catch {
    return {};
  }
}

export interface VnMonthlyRow {
  ts: number;
  exportsYoy: number | null;
  iipYoy: number | null;
  retailYoy: number | null;
  cpiYoy: number | null;
  /** Trade balance of the month, billion USD (+ surplus). */
  balance: number | null;
}

export interface VnMonthly {
  /** The newest report figures were read from. */
  report: { year: number; month: number; link: string; title: string; published: string | null; model?: string; at: number } | null;
  /** Newest value of each field (`config/nso.ts` keys), with its period. */
  latest: Record<string, Point>;
  /** Value of a field one period before its newest. */
  prior: Record<string, Point>;
  /** Exports to the US in the newest month: year to date minus the month before (January: its own year to date). */
  usMonth: Point | null;
  /** Exports to the US, year to date, against the same months a year earlier (%). */
  usYtdYoy: number | null;
  /** Trade balance from January to the newest month, when every month of the year is known. */
  balanceYtd: number | null;
  rows: VnMonthlyRow[];
}

const monthTs = (year: number, month: number) => Date.UTC(year, month - 1, 1);

/** Monthly figures of the Vietnam page's "This month's figures" panel. */
export function vnMonthly(db: DatabaseSync, now = Date.now()): VnMonthly {
  const all = db.prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts <= ? ORDER BY ts");
  const series = (key: string) => all.all(nsoId(key), now) as unknown as Point[];
  const keys = ["EXPORTS", "EXPORTS_YOY", "IMPORTS", "TRADE_BAL", "EXPORTS_US_YTD", "IIP_YOY", "RETAIL_YOY", "CPI_YOY", "CPI_MOM", "FDI_DISB_YTD", "FDI_DISB_YTD_YOY", "FDI_REG_YTD", "CREDIT_YTD", "GDP_YOY"];
  const data = Object.fromEntries(keys.map((k) => [k, series(k)])) as Record<string, Point[]>;
  const latest: Record<string, Point> = {};
  const prior: Record<string, Point> = {};
  for (const k of keys) {
    const pts = data[k];
    if (pts.length) latest[k] = pts[pts.length - 1];
    if (pts.length > 1) prior[k] = pts[pts.length - 2];
  }

  const at = (k: string, ts: number) => data[k].find((p) => p.ts === ts)?.value ?? null;

  let usMonth: Point | null = null;
  let usYtdYoy: number | null = null;
  const us = latest.EXPORTS_US_YTD;
  if (us) {
    const d = new Date(us.ts);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const before = m === 1 ? 0 : at("EXPORTS_US_YTD", monthTs(y, m - 1));
    if (before !== null) usMonth = { ts: us.ts, value: us.value - before };
    const lastYear = at("EXPORTS_US_YTD", monthTs(y - 1, m));
    if (lastYear) usYtdYoy = (us.value / lastYear - 1) * 100;
  }

  let balanceYtd: number | null = null;
  const bal = latest.TRADE_BAL;
  if (bal) {
    const d = new Date(bal.ts);
    const months = Array.from({ length: d.getUTCMonth() + 1 }, (_, i) => at("TRADE_BAL", Date.UTC(d.getUTCFullYear(), i, 1)));
    if (months.every((v) => v !== null)) balanceYtd = months.reduce<number>((a, v) => a + (v ?? 0), 0);
  }

  // One row per month from NSO_SINCE to the newest month with any figure.
  const newest = Math.max(0, ...["EXPORTS_YOY", "IIP_YOY", "RETAIL_YOY", "CPI_YOY", "TRADE_BAL"].map((k) => latest[k]?.ts ?? 0));
  const rows: VnMonthlyRow[] = [];
  if (newest) {
    for (let ts = monthTs(NSO_SINCE.year, NSO_SINCE.month); ts <= newest; ts = Date.UTC(new Date(ts).getUTCFullYear(), new Date(ts).getUTCMonth() + 1, 1)) {
      rows.push({
        ts,
        exportsYoy: at("EXPORTS_YOY", ts),
        iipYoy: at("IIP_YOY", ts),
        retailYoy: at("RETAIL_YOY", ts),
        cpiYoy: at("CPI_YOY", ts),
        balance: at("TRADE_BAL", ts),
      });
    }
  }
  while (rows.length && [rows[0].exportsYoy, rows[0].iipYoy, rows[0].retailYoy, rows[0].cpiYoy, rows[0].balance].every((v) => v === null)) rows.shift();

  const records = readReports(db);
  const done = Object.entries(records)
    .filter(([, r]) => !r.error && r.kept.length)
    .sort(([a], [b]) => (a < b ? 1 : -1))[0];
  const report = done
    ? { year: Number(done[0].slice(0, 4)), month: Number(done[0].slice(5, 7)), link: done[1].link, title: done[1].title, published: done[1].published ?? null, model: done[1].model, at: done[1].at }
    : null;

  return { report, latest, prior, usMonth, usYtdYoy, balanceYtd, rows };
}
