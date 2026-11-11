import { SOURCE_META } from "@/config/sources";
import { COT_COLUMNS, COT_MARKETS, cotId, type CotMarket, type CotReport } from "@/config/cot";
import { fetchBuffer, parseCsv } from "./http";
import { unzipFirst } from "./gdelt";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Futures positioning from the CFTC's Commitments of Traders, futures only
// (config/cot.ts). The Socrata API at publicreporting.cftc.gov answers 403, so
// this reads the yearly zips on www.cftc.gov: one CSV per report and year, with
// a header row, rewritten every Friday with the week's report (Tuesday's
// positions). A run reads the current year; the first run, or a market newly
// added to the config, also reads the three years before, for the percentile.

const FILE: Record<CotReport, string> = { disagg: "fut_disagg_txt", fin: "fut_fin_txt" };
const url = (report: CotReport, year: number) => `https://www.cftc.gov/files/dea/history/${FILE[report]}_${year}.zip`;
const DAY = 86_400_000;
/** Newest report older than this: the CFTC has stopped publishing (it does during a US government shutdown). */
const MAX_LAG_DAYS = 17;
/** A market this far behind the newest report: its contract code has likely changed. */
const MAX_BEHIND_DAYS = 14;

export interface CotWeek {
  /** Report date (positions as of Tuesday), 00:00 UTC. */
  ts: number;
  /** Long − short of the market's group, contracts. */
  net: number;
  oi: number;
}

function num(s: string | undefined, what: string): number {
  const v = Number(s?.trim());
  if (s === undefined || s.trim() === "" || !Number.isFinite(v)) throw new Error(`CFTC ${what} not a number: "${s}"`);
  return v;
}

/** Weekly net positions of `markets` (all from the same report) in one yearly CFTC file, oldest first per market. */
export function parseCot(text: string, markets: CotMarket[]): Map<string, CotWeek[]> {
  const nl = text.indexOf("\n");
  const head = parseCsv(text.slice(0, nl < 0 ? undefined : nl))[0] ?? [];
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`CFTC file has no column ${name}`);
    return i;
  };
  const iDate = col("Report_Date_as_YYYY-MM-DD");
  const iCode = col("CFTC_Contract_Market_Code");
  const iOi = col("Open_Interest_All");
  const byCode = new Map(
    markets.map((m) => [m.code, { m, iLong: col(`${COT_COLUMNS[m.group]}_Positions_Long_All`), iShort: col(`${COT_COLUMNS[m.group]}_Positions_Short_All`) }]),
  );
  const out = new Map<string, CotWeek[]>(markets.map((m) => [m.key, []]));
  if (nl < 0) return out;
  const needles = markets.map((m) => `,${m.code},`);
  for (const line of text.slice(nl + 1).split("\n")) {
    // The code is written bare (",067651,"): skip the other few thousand markets before parsing the line.
    if (!needles.some((n) => line.includes(n))) continue;
    const r = parseCsv(line)[0];
    const hit = r && byCode.get(r[iCode]?.trim());
    if (!hit) continue;
    const date = r[iDate]?.trim() ?? "";
    const ts = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (!Number.isFinite(ts)) throw new Error(`CFTC report date not understood for ${hit.m.key}: "${date}"`);
    const long = num(r[hit.iLong], `${hit.m.key} long`);
    const short = num(r[hit.iShort], `${hit.m.key} short`);
    out.get(hit.m.key)!.push({ ts, net: long - short, oi: num(r[iOi], `${hit.m.key} open interest`) });
  }
  for (const weeks of out.values()) weeks.sort((a, b) => a.ts - b.ts);
  return out;
}

const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export const cot: Source = {
  id: "cot",
  ...SOURCE_META.cot,
  async run({ db, log }) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const january = now.getUTCMonth() === 0;
    const count = db.prepare("SELECT COUNT(*) AS n FROM observations WHERE series_id = ?");
    const backfill = COT_MARKETS.some((m) => (count.get(cotId(m.key, "net")) as { n: number }).n === 0);
    // In January the last reports of December are still landing in the previous year's file.
    const years = backfill ? [year - 3, year - 2, year - 1, year] : january ? [year - 1, year] : [year];

    const weeks = new Map<string, CotWeek[]>(COT_MARKETS.map((m) => [m.key, []]));
    for (const y of years) {
      for (const report of ["disagg", "fin"] as const) {
        let zip: Buffer;
        try {
          zip = await fetchBuffer(url(report, y), { timeoutMs: 120_000 });
        } catch (err) {
          // The new year's file appears with its first report, in the second week of January.
          if (y === year && january && err instanceof Error && err.message.startsWith("HTTP 404")) {
            log(`${FILE[report]}_${y} not published yet`);
            continue;
          }
          throw err;
        }
        const parsed = parseCot(unzipFirst(zip).toString("latin1"), COT_MARKETS.filter((m) => m.report === report));
        for (const [key, w] of parsed) weeks.get(key)!.push(...w);
      }
    }

    const missing = COT_MARKETS.filter((m) => !weeks.get(m.key)!.length);
    if (missing.length) throw new Error(`no CFTC rows for ${missing.map((m) => `${m.key} (${m.code})`).join(", ")} in ${years.join(", ")}`);
    let written = 0;
    for (const m of COT_MARKETS) {
      const w = weeks.get(m.key)!;
      written += upsertSeries(db, cotId(m.key, "net"), "cot", w.map((x) => ({ ts: x.ts, value: x.net })));
      written += upsertSeries(db, cotId(m.key, "oi"), "cot", w.map((x) => ({ ts: x.ts, value: x.oi })));
    }

    const last = new Map(COT_MARKETS.map((m) => [m.key, Math.max(...weeks.get(m.key)!.map((x) => x.ts))]));
    const newest = Math.max(...last.values());
    log(`read ${years.join(", ")}; newest report ${iso(newest)}`);
    if (now.getTime() - newest > MAX_LAG_DAYS * DAY) throw new Error(`CFTC reports stop at ${iso(newest)}`);
    const behind = COT_MARKETS.filter((m) => newest - last.get(m.key)! > MAX_BEHIND_DAYS * DAY);
    if (behind.length) throw new Error(`no recent CFTC report for ${behind.map((m) => `${m.key} (${m.code}, last ${iso(last.get(m.key)!)})`).join(", ")}`);
    return written;
  },
};
