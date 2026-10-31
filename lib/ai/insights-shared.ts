// Shared between the worker (writes indicator notes) and the web server (reads
// them), kept free of SDK imports so the web bundle stays lean.

export interface StoredInsight {
  en: string;
  vi: string;
  sources: { title: string; url: string; source: string }[];
  model: string;
}

/** Notes older than this are not shown: the story behind a move goes stale. */
export const INSIGHT_MAX_AGE = 24 * 3600_000;
