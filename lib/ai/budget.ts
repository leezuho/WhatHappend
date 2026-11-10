import type { DatabaseSync } from "node:sqlite";
import type { AiConfig } from "./config";

// Daily request budget per model. Free-tier Gemini keys get a small quota per
// model and day (gemini-flash-latest = gemini-3.8-flash: 20 requests a day on
// 2026-11-09), reset at midnight Pacific time. Every call made through
// generateJson() with a db is counted here; a 429 for a daily quota blocks that
// model until the reset instead of letting each source retry into it; and
// sources ask callsLeft() before spending, so the cheap jobs leave room for the
// daily brief.
//
//   AI_DAILY_LIMIT_BRIEF  requests a day for the "brief" model (default: 20 on Gemini, unlimited on Claude; 0 = unlimited)
//   AI_DAILY_LIMIT_FAST   the same for the "fast" model (default: unlimited)

const QUOTA_TZ = "America/Los_Angeles";
const GEMINI_FREE_BRIEF = 20;

/**
 * Calls of the "brief" model that the optional jobs (indicator notes) leave untouched each day: the daily brief,
 * one "Regenerate" press, the weekly macro and tech notes, and one retry.
 */
export const BRIEF_RESERVE = 5;

/** The quota day a timestamp falls in (YYYY-MM-DD, Pacific time). */
export function quotaDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TZ }).format(now);
}

const callsKey = (model: string, day: string) => `ai:calls:${day}:${model}`;
const exhaustedKey = (model: string) => `ai:exhausted:${model}`;

function kvGet(db: DatabaseSync, key: string): string | null {
  return (db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string | null } | undefined)?.value ?? null;
}

function kvSet(db: DatabaseSync, key: string, value: string, now: number): void {
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
    key,
    value,
    now,
  );
}

export function callsToday(db: DatabaseSync, model: string, now = Date.now()): number {
  return Number(kvGet(db, callsKey(model, quotaDay(now))) ?? 0);
}

export function recordCall(db: DatabaseSync, model: string, now = Date.now()): void {
  kvSet(db, callsKey(model, quotaDay(now)), String(callsToday(db, model, now) + 1), now);
  // Counters of past days are kept a week for the log, then dropped.
  db.prepare("DELETE FROM kv WHERE key LIKE 'ai:calls:%' AND updated_at < ?").run(now - 7 * 24 * 3600_000);
}

/** After a daily-quota 429: no more calls to this model until the quota day changes. */
export function markExhausted(db: DatabaseSync, model: string, now = Date.now()): void {
  kvSet(db, exhaustedKey(model), quotaDay(now), now);
}

export function isExhausted(db: DatabaseSync, model: string, now = Date.now()): boolean {
  return kvGet(db, exhaustedKey(model)) === quotaDay(now);
}

/** A provider error that means the model's daily quota is spent (not a per-minute burst, which passes on its own). */
export function isDailyQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null;
  const msg = e?.message ?? String(err);
  return (e?.status === 429 || /\b429\b|RESOURCE_EXHAUSTED/.test(msg)) && /per ?day|PerDay|daily/i.test(msg);
}

export function dailyLimit(config: AiConfig, tier: "brief" | "fast", env: Record<string, string | undefined> = process.env): number {
  const raw = (tier === "brief" ? env.AI_DAILY_LIMIT_BRIEF : env.AI_DAILY_LIMIT_FAST)?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n === 0 ? Infinity : n;
  }
  return config.provider === "gemini" && tier === "brief" ? GEMINI_FREE_BRIEF : Infinity;
}

/** Calls a tier's model has left today: 0 once a daily-quota error was seen, Infinity when unlimited. */
export function callsLeft(db: DatabaseSync, config: AiConfig, tier: "brief" | "fast", now = Date.now()): number {
  const model = config.models[tier];
  if (isExhausted(db, model, now)) return 0;
  return Math.max(0, dailyLimit(config, tier) - callsToday(db, model, now));
}
