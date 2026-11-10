import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { PACKAGES, pkgId } from "@/config/tech";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// Weekly downloads of the main web frameworks and AI SDKs: npm's public
// downloads API (a year of days per package) and pypistats.org (about six
// months). Days are summed into whole weeks, Monday to Sunday UTC, so the
// weekday/weekend rhythm does not read as a trend; the running week is left out.

const Npm = z.object({ downloads: z.array(z.object({ day: z.string(), downloads: z.number() })) });
const Pypi = z.object({ data: z.array(z.object({ category: z.string(), date: z.string(), downloads: z.number() })) });

const DAY = 24 * 3600_000;

/** Daily counts → totals per Monday-to-Sunday week (stamped Monday, UTC), complete weeks only. */
export function weeklyTotals(days: { date: string; downloads: number }[], now: number): { ts: number; value: number }[] {
  const weeks = new Map<number, { sum: number; n: number }>();
  for (const d of days) {
    const ts = Date.parse(`${d.date}T00:00:00Z`);
    if (!Number.isFinite(ts)) continue;
    const monday = ts - ((new Date(ts).getUTCDay() + 6) % 7) * DAY;
    const w = weeks.get(monday) ?? { sum: 0, n: 0 };
    w.sum += d.downloads;
    w.n++;
    weeks.set(monday, w);
  }
  return [...weeks]
    .filter(([monday, w]) => w.n === 7 && monday + 7 * DAY <= now)
    .sort((a, b) => a[0] - b[0])
    .map(([ts, w]) => ({ ts, value: w.sum }));
}

export const pkgtrends: Source = {
  id: "pkgtrends",
  ...SOURCE_META.pkgtrends,
  async run({ db, log }) {
    const now = Date.now();
    let written = 0;
    const failed: string[] = [];
    for (const p of PACKAGES) {
      try {
        const days =
          p.registry === "npm"
            ? (await fetchJson(`https://api.npmjs.org/downloads/range/last-year/${encodeURIComponent(p.name).replace("%40", "@")}`, Npm)).downloads.map((d) => ({ date: d.day, downloads: d.downloads }))
            : (await fetchJson(`https://pypistats.org/api/packages/${p.name}/overall?mirrors=false`, Pypi)).data.filter((d) => d.category === "without_mirrors");
        const weeks = weeklyTotals(days, now);
        if (!weeks.length) throw new Error("no complete week");
        written += upsertSeries(db, pkgId(p), "pkgtrends", weeks);
      } catch (err) {
        failed.push(`${p.registry}:${p.name}: ${err instanceof Error ? err.message : err}`);
      }
      // pypistats.org is a small volunteer service; space the calls out.
      await new Promise((r) => setTimeout(r, p.registry === "pypi" ? 1500 : 200));
    }
    if (failed.length) log(failed.join(" | "));
    if (failed.length === PACKAGES.length) throw new Error("every package failed");
    return written;
  },
};
