import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { hashId, replaceItems } from "./store";
import type { Source } from "./types";

// This week's economic calendar (ForexFactory's public JSON). Only this week
// is published and there is no "actual" field. FOMC meetings come from
// config/fomc.ts and are merged in the UI, not stored here.

const Resp = z.array(
  z.object({
    title: z.string(),
    country: z.string(),
    date: z.string(),
    impact: z.string(),
    forecast: z.string().nullish(),
    previous: z.string().nullish(),
  }),
);

const MEDIUM_FOR = new Set(["USD", "CNY", "EUR"]);

export const calendar: Source = {
  id: "calendar",
  ...SOURCE_META.calendar,
  async run({ db }) {
    const rows = await fetchJson("https://nfs.faireconomy.media/ff_calendar_thisweek.json", Resp);
    const since = Date.now() - 6 * 3600_000;
    const keep = rows
      .map((r) => ({ ...r, ts: Date.parse(r.date) }))
      .filter((r) => Number.isFinite(r.ts) && r.ts >= since)
      .filter((r) => r.impact === "High" || (r.impact === "Medium" && MEDIUM_FOR.has(r.country)))
      .sort((a, b) => a.ts - b.ts);
    return replaceItems(
      db,
      "calendar",
      keep.map((r) => ({
        id: hashId(r.title + r.date + r.country),
        title: r.title,
        ts: r.ts,
        data: { country: r.country, impact: r.impact, forecast: r.forecast || null, previous: r.previous || null },
      })),
    );
  },
};
