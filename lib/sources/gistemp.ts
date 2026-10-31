import { SOURCE_META } from "@/config/sources";
import { fetchText, parseCsv } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// NASA GISTEMP v4 global land-ocean temperature anomaly (°C vs 1951–1980),
// monthly. Line 1 is a title, line 2 the header; "***" marks missing months.

const URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const gistemp: Source = {
  id: "gistemp",
  ...SOURCE_META.gistemp,
  async run({ db }) {
    const text = await fetchText(URL, { timeoutMs: 30_000 });
    const rows = parseCsv(text.split("\n").slice(1).join("\n"));
    const header = rows[0]?.map((h) => h.trim()) ?? [];
    const cols = MONTHS.map((m) => header.indexOf(m));
    if (header[0] !== "Year" || cols.some((c) => c < 0)) throw new Error(`unexpected GISTEMP header: ${header.slice(0, 5).join(",")}`);
    const points: Point[] = rows.slice(1).flatMap((r) => {
      const year = Number(r[0]);
      if (!Number.isFinite(year) || year < 1990) return [];
      return cols.flatMap((c, i) => {
        const raw = r[c]?.trim();
        const v = Number(raw);
        return raw && raw !== "***" && Number.isFinite(v) ? [{ ts: Date.UTC(year, i, 1), value: v }] : [];
      });
    });
    if (!points.length) throw new Error("no GISTEMP values parsed");
    return upsertSeries(db, "giss:global", "gistemp", points);
  },
};
