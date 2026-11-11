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
  oecd: { intervalMs: 24 * HOUR },
  imfcpi: { intervalMs: 24 * HOUR },
  worldbank: { intervalMs: 24 * HOUR },
  cnbc: { intervalMs: 6 * HOUR },
  ibge: { intervalMs: 24 * HOUR },
  gpr: { intervalMs: 24 * HOUR },
  gscpi: { intervalMs: 24 * HOUR },
  // CFTC Commitments of Traders: weekly, Tuesday's positions published Friday afternoon (US time).
  cot: { intervalMs: 12 * HOUR },
  // News & AI
  rss: { intervalMs: 10 * MIN },
  gdelt: { intervalMs: 15 * MIN },
  translate: { intervalMs: 5 * MIN, needsAi: true },
  brief: { intervalMs: 24 * HOUR, needsAi: true },
  insights: { intervalMs: 30 * MIN, needsAi: true },
  macronote: { intervalMs: 24 * HOUR, needsAi: true },
  technote: { intervalMs: 24 * HOUR, needsAi: true },
  themes: { intervalMs: 24 * HOUR, needsAi: true },
  // Derived from the database only: the "What's new" change log (lib/data/changes.ts).
  changes: { intervalMs: 15 * MIN },
  // Alerts: sends to Telegram what the change log and a few conditions report (lib/data/alerts.ts).
  telegram: { intervalMs: 5 * MIN, requiresEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
  // Map
  usgs: { intervalMs: 10 * MIN },
  gdacs: { intervalMs: 30 * MIN },
  eonet: { intervalMs: HOUR },
  // Trending, calendar, prediction
  wikipedia: { intervalMs: 3 * HOUR },
  hackernews: { intervalMs: 20 * MIN },
  // ForexFactory asks for at most one request an hour; hourly also picks up FRED actuals soon after a release.
  calendar: { intervalMs: HOUR },
  releases: { intervalMs: 24 * HOUR },
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
  vnstocks: { intervalMs: 5 * MIN },
  vnflows: { intervalMs: 30 * MIN },
  sbvrate: { intervalMs: 6 * HOUR },
  petrolimex: { intervalMs: HOUR },
  ibrate: { intervalMs: 6 * HOUR },
  sjc: { intervalMs: 30 * MIN },
  vcb: { intervalMs: HOUR },
  sbv: { intervalMs: 12 * HOUR },
  // Crypto
  coingecko: { intervalMs: 5 * MIN },
  fng: { intervalMs: HOUR },
  deribit: { intervalMs: HOUR },
  defillama: { intervalMs: 6 * HOUR },
  mempool: { intervalMs: 10 * MIN },
  binance: { intervalMs: 15 * MIN },
  etfflows: { intervalMs: 3 * HOUR },
  // Technology
  cloudstatus: { intervalMs: 10 * MIN },
  openrouter: { intervalMs: 6 * HOUR },
  huggingface: { intervalMs: 3 * HOUR },
  kev: { intervalMs: 6 * HOUR },
  twse: { intervalMs: 12 * HOUR },
  hnhiring: { intervalMs: 24 * HOUR },
  eol: { intervalMs: 24 * HOUR },
  arena: { intervalMs: 24 * HOUR },
  lobsters: { intervalMs: 30 * MIN },
  spaceweather: { intervalMs: HOUR },
  pkgtrends: { intervalMs: 24 * HOUR },
  epoch: { intervalMs: 24 * HOUR },
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
