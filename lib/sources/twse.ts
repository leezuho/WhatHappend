import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { TW_REVENUE, twRevenueId } from "@/config/tech";
import { fetchJson } from "./http";
import { replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Monthly revenue of Taiwan's listed companies (TWSE OpenAPI, keyless): one
// file with every company's latest month, published as reports come in
// (most by the 10th). Only the latest month is served, so the series grows a
// month at a time; the file carries the y/y comparisons itself.

const Row = z.object({
  資料年月: z.string(),
  公司代號: z.string(),
  "營業收入-當月營收": z.string(),
  "營業收入-上月比較增減(%)": z.string().nullish(),
  "營業收入-去年同月增減(%)": z.string().nullish(),
  "累計營業收入-前期比較增減(%)": z.string().nullish(),
});
const Resp = z.array(z.record(z.string(), z.unknown()));

export interface TwRevenue {
  code: string;
  /** First day of the reported month, UTC. */
  month: number;
  /** NT$ billion. */
  revenue: number;
  mom: number | null;
  yoy: number | null;
  /** Year to date against the same months a year earlier, %. */
  ytdYoy: number | null;
}

/** "11509" (Republic of China year 115, month 09) → 1 September 2026, UTC. */
export function rocMonth(s: string): number {
  const m = /^(\d{2,3})(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`unexpected month ${s}`);
  return Date.UTC(Number(m[1]) + 1911, Number(m[2]) - 1, 1);
}

const pct = (s: string | null | undefined) => {
  const v = s === null || s === undefined || s.trim() === "" ? NaN : Number(s);
  return Number.isFinite(v) ? v : null;
};

export function twRevenueRows(rows: unknown[]): TwRevenue[] {
  return TW_REVENUE.flatMap((c) => {
    const raw = rows.find((r) => (r as Record<string, unknown>)["公司代號"] === c.code);
    if (!raw) return [];
    const r = Row.parse(raw);
    const revenue = Number(r["營業收入-當月營收"]);
    if (!Number.isFinite(revenue) || revenue <= 0) throw new Error(`${c.code}: revenue ${r["營業收入-當月營收"]}`);
    return [
      {
        code: c.code,
        month: rocMonth(r.資料年月),
        // Reported in NT$ thousand.
        revenue: revenue / 1e6,
        mom: pct(r["營業收入-上月比較增減(%)"]),
        yoy: pct(r["營業收入-去年同月增減(%)"]),
        ytdYoy: pct(r["累計營業收入-前期比較增減(%)"]),
      },
    ];
  });
}

export const twse: Source = {
  id: "twse",
  ...SOURCE_META.twse,
  async run({ db }) {
    const rows = twRevenueRows(await fetchJson("https://openapi.twse.com.tw/v1/opendata/t187ap05_L", Resp, { timeoutMs: 40_000 }));
    if (!rows.length) throw new Error("none of the tracked companies in the file");
    let written = 0;
    for (const r of rows) written += upsertSeries(db, twRevenueId(r.code), "twse", [{ ts: r.month, value: r.revenue }]);
    return written + replaceItems(db, "tw_revenue", rows.map((r) => ({ id: r.code, title: r.code, ts: r.month, data: r })));
  },
};
