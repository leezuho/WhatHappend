import * as XLSX from "xlsx";
import { SOURCE_META } from "@/config/sources";
import { fetchBuffer } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Caldara & Iacoviello daily Geopolitical Risk index (legacy .xls workbook).
// 100 = 1985–2019 average; we keep the last three years.

const URL = "https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls";
const KEEP = 3 * 365 * 24 * 3600_000;

export const gpr: Source = {
  id: "gpr",
  ...SOURCE_META.gpr,
  async run({ db }) {
    const wb = XLSX.read(await fetchBuffer(URL, { timeoutMs: 60_000 }), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const since = Date.now() - KEEP;
    const daily: { ts: number; value: number }[] = [];
    const ma7: { ts: number; value: number }[] = [];
    for (const r of rows) {
      const day = String(r.DAY ?? "");
      if (!/^\d{8}$/.test(day)) continue;
      const ts = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
      if (ts < since) continue;
      if (typeof r.GPRD === "number") daily.push({ ts, value: r.GPRD });
      if (typeof r.GPRD_MA7 === "number") ma7.push({ ts, value: r.GPRD_MA7 });
    }
    if (!daily.length) throw new Error("no GPRD rows found (sheet layout changed?)");
    return upsertSeries(db, "gpr:GPRD", "gpr", daily) + upsertSeries(db, "gpr:GPRD_MA7", "gpr", ma7);
  },
};
