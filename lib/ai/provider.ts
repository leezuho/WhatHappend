import type { DatabaseSync } from "node:sqlite";
import type { z } from "zod";
import { callsLeft, isDailyQuotaError, markExhausted, recordCall } from "./budget";
import { aiStatus, type AiConfig } from "./config";
import { anthropicJson } from "./providers/anthropic";
import { geminiJson } from "./providers/gemini";

// One entry point for structured (JSON) generation, whatever the provider.
// Every adapter validates the model output against the same zod schema.

export interface JsonRequest<S extends z.ZodType> {
  /** "brief" = judgment-heavy writing; "fast" = cheap bulk work. Picks the model and effort. */
  tier: "brief" | "fast";
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  /** Count the call against the model's daily budget (lib/ai/budget.ts) and refuse it once the budget is spent. */
  db?: DatabaseSync;
}

export interface JsonResult<T> {
  /** null when the model refused, was cut off, or returned something off-schema. */
  data: T | null;
  model: string;
  stopReason: string | null;
  usage: { input: number; output: number } | null;
}

export type JsonAdapter = <S extends z.ZodType>(config: AiConfig, req: JsonRequest<S>) => Promise<JsonResult<z.infer<S>>>;

export async function generateJson<S extends z.ZodType>(req: JsonRequest<S>): Promise<JsonResult<z.infer<S>>> {
  const status = aiStatus();
  if (!status.ok) throw new Error(`AI not configured: ${status.reason}`);
  const adapter: JsonAdapter = status.config.provider === "gemini" ? geminiJson : anthropicJson;
  const model = status.config.models[req.tier];
  if (req.db) {
    if (callsLeft(req.db, status.config, req.tier) <= 0) throw new Error(`daily AI budget for ${model} is spent; it resets at midnight Pacific time`);
    recordCall(req.db, model);
  }
  try {
    return await adapter(status.config, req);
  } catch (err) {
    if (req.db && isDailyQuotaError(err)) markExhausted(req.db, model);
    throw err;
  }
}
