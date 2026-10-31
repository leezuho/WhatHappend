import { SOURCE_META } from "@/config/sources";
import { fetchText, parseCsv } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Atmospheric CO₂ at Mauna Loa (NOAA GML): daily ppm for the last two years and
// monthly averages for the last ten.

const DAILY = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv";
const MONTHLY = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv";
const YEAR = 365 * 24 * 3600_000;

function dataRows(text: string): string[][] {
  return parseCsv(text.split("\n").filter((l) => !l.startsWith("#")).join("\n"));
}

const valid = (v: number) => Number.isFinite(v) && v > 0;

export const co2: Source = {
  id: "co2",
  ...SOURCE_META.co2,
  async run({ db }) {
    const now = Date.now();
    // Daily file: no header row; columns year,month,day,decimal,ppm.
    const daily: Point[] = dataRows(await fetchText(DAILY, { timeoutMs: 30_000 })).flatMap((r) => {
      const [y, m, d, , ppm] = r.map(Number);
      const ts = Date.UTC(y, m - 1, d);
      return valid(ppm) && ts >= now - 2 * YEAR ? [{ ts, value: ppm }] : [];
    });
    // Monthly file: header row year,month,decimal date,average,...
    const mm = dataRows(await fetchText(MONTHLY, { timeoutMs: 30_000 }));
    const iAvg = mm[0]?.findIndex((h) => h.trim() === "average") ?? -1;
    if (iAvg < 0) throw new Error("co2_mm_mlo.csv: no 'average' column");
    const monthly: Point[] = mm.slice(1).flatMap((r) => {
      const ts = Date.UTC(Number(r[0]), Number(r[1]) - 1, 1);
      const v = Number(r[iAvg]);
      return valid(v) && ts >= now - 10 * YEAR ? [{ ts, value: v }] : [];
    });
    if (!daily.length && !monthly.length) throw new Error("no CO2 values parsed");
    return upsertSeries(db, "noaa:co2", "co2", daily) + upsertSeries(db, "noaa:co2:monthly", "co2", monthly);
  },
};
