import type { z } from "zod";
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
  return adapter(status.config, req);
}
