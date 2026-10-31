// Schedule metadata for every source, kept free of fetcher imports so the web
// server can compute staleness without bundling the fetchers.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const SOURCE_META = {
  // Markets & macro
  yahoo: { intervalMs: 3 * MIN },
  fred: { intervalMs: 6 * HOUR },
  imf: { intervalMs: 24 * HOUR },
  bis: { intervalMs: 12 * HOUR },
  gpr: { intervalMs: 24 * HOUR },
  gscpi: { intervalMs: 24 * HOUR },
  // News & AI
  rss: { intervalMs: 10 * MIN },
  gdelt: { intervalMs: 15 * MIN },
  translate: { intervalMs: 5 * MIN, needsAi: true },
  brief: { intervalMs: 24 * HOUR, needsAi: true },
  insights: { intervalMs: 30 * MIN, needsAi: true },
  // Map
  usgs: { intervalMs: 10 * MIN },
  gdacs: { intervalMs: 30 * MIN },
  eonet: { intervalMs: HOUR },
  // Trending, calendar, prediction
  wikipedia: { intervalMs: 3 * HOUR },
  hackernews: { intervalMs: 20 * MIN },
  calendar: { intervalMs: 3 * HOUR },
  launches: { intervalMs: 3 * HOUR },
  polymarket: { intervalMs: 15 * MIN },
  kalshi: { intervalMs: 15 * MIN },
  // Planet & health
  co2: { intervalMs: 24 * HOUR },
  gistemp: { intervalMs: 24 * HOUR },
  airquality: { intervalMs: HOUR },
  who: { intervalMs: 6 * HOUR },
  // Vietnam
  vnindex: { intervalMs: 3 * MIN },
  sjc: { intervalMs: 30 * MIN },
  vcb: { intervalMs: HOUR },
} satisfies Record<string, SourceMeta>;

export type SourceId = keyof typeof SOURCE_META;

export interface SourceMeta {
  intervalMs: number;
  requiresEnv?: string[];
  /** Needs a configured AI provider (see lib/ai/config.ts). */
  needsAi?: boolean;
}

export function sourceMeta(id: SourceId): SourceMeta {
  return SOURCE_META[id];
}
