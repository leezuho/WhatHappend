import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { getPoints } from "@/lib/data/series";
import { fetchJson } from "./http";
import { replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Petrolimex retail fuel prices (VND per litre), from the API behind the price
// board on petrolimex.com.vn: a CMS search whose filter is base64url-encoded
// JSON, taken from the site's own script (_themes/sunrise/js/all.js). Zone 1
// is most of the country, zone 2 the remote areas. Prices change at the
// Ministry of Industry and Trade's weekly adjustment; the API has no history,
// so one point per day is kept and the change is measured against the last
// different price.

const FILTER = {
  FilterBy: {
    And: [
      { SystemID: { Equals: "6783dc1271ff449e95b74a9520964169" } },
      { RepositoryID: { Equals: "a95451e23b474fe5886bfb7cf843f53c" } },
      { RepositoryEntityID: { Equals: "3801378fe1e045b1afa10de7c5776124" } },
      { Status: { Equals: "Published" } },
    ],
  },
  SortBy: { LastModified: "Descending" },
  Pagination: { TotalRecords: -1, TotalPages: 0, PageSize: 0, PageNumber: 0 },
};

const Resp = z.object({
  Objects: z.array(
    z.object({
      ID: z.string(),
      Title: z.string(),
      EnglishTitle: z.string().nullish(),
      Zone1Price: z.number(),
      Zone2Price: z.number().nullish(),
      DIsplayOrder: z.number().nullish(),
      LastModified: z.string(),
    }),
  ),
});

export interface FuelPrice {
  id: string;
  name: { en: string; vi: string };
  zone1: number;
  zone2: number | null;
  /** zone1 − the last different zone-1 price stored; null until a change has been seen. */
  change: number | null;
  /** When Petrolimex last edited the row (ms): the adjustment time, give or take an edit. */
  modified: number;
}

const DAY = 24 * 3600_000;
export const fuelSeriesId = (id: string) => `petrolimex:${id}:z1`;

/** The current price against the last different one in the stored history. */
export function lastChange(history: { value: number }[], price: number): number | null {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].value !== price) return price - history[i].value;
  return null;
}

export const petrolimex: Source = {
  id: "petrolimex",
  ...SOURCE_META.petrolimex,
  async run({ db }) {
    const url = `https://portals.petrolimex.com.vn/~apis/portals/cms.item/search?x-request=${Buffer.from(JSON.stringify(FILTER)).toString("base64url")}`;
    const r = await fetchJson(url, Resp);
    if (r.Objects.length < 3) throw new Error(`only ${r.Objects.length} products`);
    const now = Date.now();
    const today = Math.floor((now + 7 * 3600_000) / DAY) * DAY;
    let written = 0;
    const rows: FuelPrice[] = [...r.Objects]
      .sort((a, b) => (a.DIsplayOrder ?? 99) - (b.DIsplayOrder ?? 99))
      .map((o) => {
        if (o.Zone1Price < 5_000 || o.Zone1Price > 100_000) throw new Error(`${o.Title}: implausible price ${o.Zone1Price}`);
        const id = fuelSeriesId(o.ID);
        const change = lastChange(getPoints(db, id).filter((p) => p.ts < today), o.Zone1Price);
        written += upsertSeries(db, id, "petrolimex", [{ ts: today, value: o.Zone1Price }]);
        return {
          id: o.ID,
          name: { en: o.EnglishTitle || o.Title, vi: o.Title },
          zone1: o.Zone1Price,
          zone2: o.Zone2Price ?? null,
          change,
          modified: Date.parse(o.LastModified),
        };
      });
    return written + replaceItems(db, "fuel_vn", rows.map((f) => ({ id: f.id, title: f.name.vi, ts: f.modified, data: f })));
  },
};
