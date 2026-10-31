import type { DatabaseSync } from "node:sqlite";
import type { SourceId } from "@/config/sources";

export interface SourceStatusRow {
  source: string;
  ok: number;
  error: string | null;
  count: number | null;
  last_run: number;
  last_ok: number | null;
}

export interface SourceContext {
  db: DatabaseSync;
  log: (msg: string) => void;
}

export interface Source {
  id: SourceId;
  /** How often the worker runs it (spread from SOURCE_META). */
  intervalMs: number;
  /** Env vars the source cannot run without; missing ones mark it "skipped". */
  requiresEnv?: string[];
  /** Needs a configured AI provider; skipped otherwise. */
  needsAi?: boolean;
  /** Override the default "interval elapsed since last run" rule (e.g. daily brief at 06:00). */
  isDue?: (now: number, status: SourceStatusRow | undefined, db: DatabaseSync) => boolean;
  /** Fetch, validate, upsert. Returns the number of records written. */
  run(ctx: SourceContext): Promise<number>;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
