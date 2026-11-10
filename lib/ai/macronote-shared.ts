// Shared between the worker (writes the weekly macro note) and the web server
// (reads it), kept free of SDK imports so the web bundle stays lean.

/** kv key holding the latest note as JSON (StoredMacroNote). */
export const MACRO_NOTE_KEY = "macro:note";

export interface MacroNoteText {
  headline: string;
  bullets: { title: string; body: string }[];
  watch: string[];
}

/** One scorecard cell as the model reads it ("3.7 Sep '26 [warn]") and its number, for next week's comparison. */
export interface SnapCell {
  s: string;
  v: number | null;
}

export interface StoredMacroNote {
  /** ISO week in Vietnam time when the note was written, e.g. "2026-W46". */
  week: string;
  /** Last week the inputs were checked; a week with no new numbers keeps the old note. */
  checkedWeek: string;
  createdAt: number;
  model: string;
  /** Hash of the slow-moving inputs (monthly, quarterly and yearly numbers); unchanged = no new note. */
  hash: string;
  /** Per economy, the cells compared against next week. */
  snapshot: Record<string, Record<string, SnapCell>>;
  en: MacroNoteText;
  vi: MacroNoteText;
}
