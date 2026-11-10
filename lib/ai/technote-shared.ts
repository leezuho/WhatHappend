import type { MacroNoteText } from "./macronote-shared";

// Shared between the worker (writes the weekly tech note) and the web server
// (reads it), kept free of SDK imports so the web bundle stays lean.

/** kv key holding the latest tech note as JSON (StoredTechNote). */
export const TECH_NOTE_KEY = "tech:note";

export type TechNoteText = MacroNoteText;

export interface StoredTechNote {
  /** ISO week in Vietnam time when the note was written, e.g. "2026-W46". */
  week: string;
  /** Last week the inputs were checked. */
  checkedWeek: string;
  createdAt: number;
  model: string;
  /** Hash of the inputs; unchanged = the old note stands. */
  hash: string;
  en: TechNoteText;
  vi: TechNoteText;
}
