// Shared between the worker (writes the theme notes) and the web server (reads
// them), kept free of SDK imports so the web bundle stays lean.

/** kv key holding the latest notes as JSON (StoredThemeNotes). */
export const THEME_NOTES_KEY = "themes:notes";

export interface StoredThemeNotes {
  /** Vietnam date the notes were written (YYYY-MM-DD). */
  date: string;
  createdAt: number;
  model: string;
  /** Each theme's status when written, "energy:cooling,fed:heating,…": a change asks for new notes. */
  basis: string;
  notes: Record<string, { en: string; vi: string }>;
}

export function parseThemeNotes(value: string | null | undefined): StoredThemeNotes | null {
  try {
    const v = JSON.parse(value ?? "") as Partial<StoredThemeNotes>;
    if (typeof v.createdAt !== "number" || typeof v.date !== "string" || !v.notes || typeof v.notes !== "object") return null;
    return { date: v.date, createdAt: v.createdAt, model: String(v.model ?? ""), basis: String(v.basis ?? ""), notes: v.notes };
  } catch {
    return null;
  }
}
