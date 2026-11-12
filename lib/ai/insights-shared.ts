// Shared between the worker (writes indicator notes) and the web server (reads
// them), kept free of SDK imports so the web bundle stays lean.

export interface StoredInsight {
  en: string;
  vi: string;
  /** One line for the card: what changed and why it matters (from 2026-11-12; older notes have none). */
  enLine?: string;
  viLine?: string;
  sources: { title: string; url: string; source: string }[];
  model: string;
}

/**
 * The card's line of a stored note: its own line, or for a note written before lines existed, its first sentence
 * (which may be the indicator's definition).
 */
export function noteLine(c: StoredInsight, lang: "en" | "vi"): string {
  const own = lang === "en" ? c.enLine : c.viLine;
  if (own?.trim()) return own.trim();
  const text = c[lang].trim();
  const end = text.search(/[.!?](\s|$)/);
  return end > 0 ? text.slice(0, end + 1) : text;
}

/** Notes older than this are not shown: the story behind a move goes stale. */
export const INSIGHT_MAX_AGE = 24 * 3600_000;
