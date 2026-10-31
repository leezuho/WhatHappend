import { SOURCE_META } from "@/config/sources";
import { COUNTRIES } from "@/config/countries";
import { fetchText, parseCsv } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Central-bank policy rates from the BIS (dataflow WS_CBPOL, daily).

export const bis: Source = {
  id: "bis",
  ...SOURCE_META.bis,
  async run({ db }) {
    const areas = COUNTRIES.flatMap((c) => (c.bis ? [c.bis] : []));
    const url = `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${areas.join("+")}?lastNObservations=400&format=csv&detail=dataonly`;
    const rows = parseCsv(await fetchText(url, { timeoutMs: 60_000 }));
    const header = rows[0] ?? [];
    const iArea = header.indexOf("REF_AREA");
    const iTime = header.indexOf("TIME_PERIOD");
    const iVal = header.indexOf("OBS_VALUE");
    if (iArea < 0 || iTime < 0 || iVal < 0) throw new Error(`unexpected BIS header: ${header.join(",")}`);
    const byArea = new Map<string, { ts: number; value: number }[]>();
    for (const r of rows.slice(1)) {
      const value = Number(r[iVal]);
      if (!r[iVal] || !Number.isFinite(value)) continue;
      const list = byArea.get(r[iArea]) ?? [];
      list.push({ ts: Date.parse(`${r[iTime]}T00:00:00Z`), value });
      byArea.set(r[iArea], list);
    }
    let written = 0;
    for (const [area, points] of byArea) written += upsertSeries(db, `bis:${area}`, "bis", points);
    if (!written) throw new Error("BIS returned no observations");
    return written;
  },
};
