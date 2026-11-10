import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Brazil's monthly unemployment rate from IBGE's SIDRA API (no key): PNAD
// Contínua table 6381, variable 4099, people aged 14 and over. IBGE publishes
// it as a rolling three-month average labelled by its last month
// ("jul-ago-set 2026" = 202609), about four weeks after that month ends.
// OECD's labour dataflow has no Brazil.

export const IBGE_UNE = "ibge:UNE:BRA";
const URL = "https://apisidra.ibge.gov.br/values/t/6381/n1/all/v/4099/p/last%2036";

// The first element is a header row naming the columns; the rest are data.
const Row = z.object({ V: z.string(), D3C: z.string() });
const Resp = z.array(Row).min(2);

/** SIDRA rows → points at the first of each rolling quarter's last month, oldest first. "..." and "-" (no data) are skipped. */
export function parseSidra(rows: z.infer<typeof Row>[]): Point[] {
  return rows
    .slice(1)
    .flatMap((r) => {
      const m = /^(\d{4})(\d{2})$/.exec(r.D3C);
      const value = Number(r.V);
      return m && /\d/.test(r.V) && Number.isFinite(value) ? [{ ts: Date.UTC(Number(m[1]), Number(m[2]) - 1, 1), value }] : [];
    })
    .sort((a, b) => a.ts - b.ts);
}

export const ibge: Source = {
  id: "ibge",
  ...SOURCE_META.ibge,
  async run({ db }) {
    const points = parseSidra(await fetchJson(URL, Resp, { timeoutMs: 30_000 }));
    if (!points.length) throw new Error("no IBGE unemployment observations");
    return upsertSeries(db, IBGE_UNE, "ibge", points);
  },
};
