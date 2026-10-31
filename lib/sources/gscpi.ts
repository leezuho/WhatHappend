import { SOURCE_META } from "@/config/sources";
import { fetchText, parseCsv } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// NY Fed Global Supply Chain Pressure Index. The interactive CSV has one row
// per month and one column per data vintage; the last column is the current one.

const URL = "https://www.newyorkfed.org/medialibrary/research/interactives/data/gscpi/gscpi_interactive_data.csv";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDate(s: string): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? null : Date.UTC(Number(m[3]), month, 1);
}

export const gscpi: Source = {
  id: "gscpi",
  ...SOURCE_META.gscpi,
  async run({ db }) {
    const rows = parseCsv(await fetchText(URL, { timeoutMs: 30_000 }));
    const header = rows[0] ?? [];
    let col = header.length - 1;
    while (col > 0 && !header[col]?.trim()) col--;
    const points = rows.slice(1).flatMap((r) => {
      const ts = parseDate(r[0] ?? "");
      const value = Number(r[col]);
      return ts !== null && r[col] && r[col] !== "#N/A" && Number.isFinite(value) && ts >= Date.UTC(2015, 0, 1) ? [{ ts, value }] : [];
    });
    if (!points.length) throw new Error(`no GSCPI values in column ${header[col]}`);
    return upsertSeries(db, "nyfed:GSCPI", "gscpi", points);
  },
};
