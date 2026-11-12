import https from "node:https";
import { constants } from "node:crypto";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// India's monthly unemployment rate from MoSPI's PLFS API (no key): current
// weekly status, aged 15 and over, rural + urban, all persons. Monthly
// estimates start in 2025 and come out about six weeks after the month; they
// are not seasonally adjusted. OECD's labour dataflow has no India.
//
// The server does not support secure renegotiation (RFC 5746), which Node
// refuses by default (ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED). The user
// chose on 2026-11-12 to allow legacy renegotiation for this host only, through
// an agent used by nothing else; the data is public and validated below.

export const MOSPI_UNE = "mospi:UNE:IND";
const HOST = "api.mospi.gov.in";
const FIRST_YEAR = 2025;
const agent = new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, keepAlive: false });

const yearUrl = (year: number) =>
  `https://${HOST}/api/plfs/getData?indicator_code=3&frequency_code=3&gender_code=3&sector_code=3&age_code=1&year=${year}&Format=JSON`;

const Row = z.object({ frequency: z.string(), year: z.string(), month: z.string(), state: z.string(), value: z.string() });
// A year with nothing published yet is `{ data: [], msg: "No Data Found" }`.
const Resp = z.object({ data: z.array(Row), statusCode: z.boolean() });

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** All-India monthly rows → points at the first of each month, oldest first. Rows for a state, another frequency or with no number are dropped. */
export function parsePlfs(rows: z.infer<typeof Row>[]): Point[] {
  return rows
    .flatMap((r) => {
      const m = MONTHS.indexOf(r.month.trim().toLowerCase());
      const year = Number(r.year);
      const value = Number(r.value);
      if (r.frequency !== "Monthly" || r.state !== "All India" || m < 0 || !Number.isInteger(year) || !/\d/.test(r.value) || !Number.isFinite(value)) return [];
      return [{ ts: Date.UTC(year, m, 1), value }];
    })
    .sort((a, b) => a.ts - b.ts);
}

function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 WhatHappendDashboard/0.1" }, timeout: 30_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`MoSPI returned non-JSON for ${url}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout for ${url}`)));
    req.on("error", reject);
  });
}

async function fetchYear(year: number) {
  const parsed = Resp.safeParse(await getJson(yearUrl(year)));
  if (!parsed.success) throw new Error(`Unexpected response shape from ${HOST}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data.data;
}

export const mospi: Source = {
  id: "mospi",
  ...SOURCE_META.mospi,
  async run({ db }) {
    const thisYear = new Date().getUTCFullYear();
    const rows = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) rows.push(...(await fetchYear(y)));
    const points = parsePlfs(rows);
    if (!points.length) throw new Error("no MoSPI unemployment observations");
    // Monthly estimates lag about six weeks; four months without a new one means the query or the API changed.
    if (Date.now() - points[points.length - 1].ts > 150 * 24 * 3600_000) throw new Error(`MoSPI's latest month is ${new Date(points[points.length - 1].ts).toISOString().slice(0, 7)}`);
    return upsertSeries(db, MOSPI_UNE, "mospi", points);
  },
};
