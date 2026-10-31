import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AiConfig } from "../config";
import type { JsonAdapter } from "../provider";

// Claude via the Messages API with structured outputs (messages.parse).

const clients = new Map<string, Anthropic>();

function client(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

/** Models that accept the server-side refusal fallback `fallbacks: "default"`. */
const DEFAULT_FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export const anthropicJson: JsonAdapter = async (config: AiConfig, req) => {
  const model = config.models[req.tier];
  const effort = req.tier === "brief" ? "medium" : "low";
  const max_tokens = req.maxTokens ?? 16000;

  if (DEFAULT_FALLBACK_MODELS.has(model)) {
    const res = await client(config.apiKey).beta.messages.parse({
      model,
      max_tokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: req.system,
      output_config: { format: betaZodOutputFormat(req.schema), effort },
      messages: [{ role: "user", content: req.user }],
    });
    return {
      data: res.stop_reason === "refusal" ? null : (res.parsed_output ?? null),
      model: res.model,
      stopReason: res.stop_reason,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    };
  }

  const res = await client(config.apiKey).messages.parse({
    model,
    max_tokens,
    system: req.system,
    output_config: { format: zodOutputFormat(req.schema), effort },
    messages: [{ role: "user", content: req.user }],
  });
  return {
    data: res.stop_reason === "refusal" ? null : (res.parsed_output ?? null),
    model: res.model,
    stopReason: res.stop_reason,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
  };
};
