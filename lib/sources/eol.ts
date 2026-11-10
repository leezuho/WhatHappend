import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { EOL_PRODUCTS } from "@/config/tech";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Release lines and end-of-life dates from endoflife.date (keyless JSON per
// product), plus TypeScript's latest release from the npm registry.

const Cycle = z.object({
  cycle: z.union([z.string(), z.number()]),
  releaseDate: z.string().nullish(),
  eol: z.union([z.string(), z.boolean()]).nullish(),
  latest: z.union([z.string(), z.number()]).nullish(),
  latestReleaseDate: z.string().nullish(),
  lts: z.union([z.string(), z.boolean()]).nullish(),
});
const Cycles = z.array(Cycle);
const NpmLatest = z.object({ version: z.string() });
const NpmTime = z.object({ time: z.record(z.string(), z.string()) });

export interface EolRow {
  name: string;
  /** Newest release line and its latest version. */
  cycle: string;
  latest: string | null;
  latestDate: number | null;
  /** End of life of the newest line (null = not set yet). */
  eol: number | null;
  /** The next line still supported to reach end of life, and when; null when none has a date. */
  nextEol: { cycle: string; date: number } | null;
}

const date = (v: string | boolean | null | undefined) => (typeof v === "string" ? Date.parse(`${v}T00:00:00Z`) : null);

/** Newest line, and the soonest end of life among lines still supported at `now`. */
export function eolRow(name: string, cycles: z.infer<typeof Cycles>, now: number): EolRow | null {
  const head = cycles[0];
  if (!head) return null;
  const upcoming = cycles
    .flatMap((c) => {
      const d = date(c.eol);
      return d !== null && d >= now ? [{ cycle: String(c.cycle), date: d }] : [];
    })
    .sort((a, b) => a.date - b.date)[0];
  return {
    name,
    cycle: String(head.cycle),
    latest: head.latest === null || head.latest === undefined ? null : String(head.latest),
    latestDate: date(head.latestReleaseDate) ?? date(head.releaseDate),
    eol: date(head.eol),
    nextEol: upcoming ?? null,
  };
}

async function typescript(): Promise<EolRow> {
  const latest = await fetchJson("https://registry.npmjs.org/typescript/latest", NpmLatest);
  // The full document is large (every version); only its `time` map is read.
  const doc = await fetchJson("https://registry.npmjs.org/typescript", NpmTime, { timeoutMs: 40_000 });
  const t = doc.time[latest.version];
  return { name: "TypeScript", cycle: latest.version.split(".").slice(0, 2).join("."), latest: latest.version, latestDate: t ? Date.parse(t) : null, eol: null, nextEol: null };
}

export const eol: Source = {
  id: "eol",
  ...SOURCE_META.eol,
  async run({ db, log }) {
    const now = Date.now();
    const results = await Promise.allSettled([
      ...EOL_PRODUCTS.map(async (p) => eolRow(p.name, await fetchJson(`https://endoflife.date/api/${p.slug}.json`, Cycles), now)),
      typescript(),
    ]);
    const rows = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${EOL_PRODUCTS[i]?.name ?? "TypeScript"}: ${r.reason instanceof Error ? r.reason.message : r.reason}`] : []));
    if (!rows.length) throw new Error(failed.join(" | ") || "no products");
    if (failed.length) log(failed.join(" | "));
    return replaceItems(db, "eol", rows.map((r) => ({ id: r.name, title: r.name, data: r })));
  },
};
