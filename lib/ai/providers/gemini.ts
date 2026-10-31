import { z } from "zod";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { AiConfig } from "../config";
import type { JsonAdapter } from "../provider";

// Google Gemini API (AI Studio keys). Structured output via responseJsonSchema,
// generated from the same zod schema we validate against.

const clients = new Map<string, GoogleGenAI>();

function client(apiKey: string): GoogleGenAI {
  let c = clients.get(apiKey);
  if (!c) {
    // Retry transient overloads ("model is experiencing high demand"). 429 is left to the
    // scheduler: on free keys it is usually a daily quota that retrying cannot fix.
    c = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 4, initialDelay: 5, maxDelay: 60, httpStatusCodes: [500, 502, 503, 504] } } });
    clients.set(apiKey, c);
  }
  return c;
}

/** JSON Schema for responseJsonSchema; Gemini rejects the `$schema` meta key. */
function jsonSchema(schema: z.ZodType): unknown {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export const geminiJson: JsonAdapter = async (config: AiConfig, req) => {
  const model = config.models[req.tier];
  const request = {
    model,
    contents: req.user,
    config: {
      systemInstruction: req.system,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema(req.schema),
      // Thinking tokens count against this limit on Gemini, so leave headroom.
      maxOutputTokens: req.maxTokens ?? 32768,
      thinkingConfig: { thinkingLevel: req.tier === "brief" ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW },
    },
  };

  let res;
  try {
    res = await client(config.apiKey).models.generateContent(request);
  } catch (err) {
    // Older models (2.x) take a thinking budget, not a level: retry with the model's default.
    if (err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message)) {
      res = await client(config.apiKey).models.generateContent({ ...request, config: { ...request.config, thinkingConfig: undefined } });
    } else throw err;
  }

  const finish = res.candidates?.[0]?.finishReason ?? null;
  const usage = res.usageMetadata
    ? { input: res.usageMetadata.promptTokenCount ?? 0, output: (res.usageMetadata.candidatesTokenCount ?? 0) + (res.usageMetadata.thoughtsTokenCount ?? 0) }
    : null;
  let data = null;
  if (res.text) {
    try {
      const parsed = req.schema.safeParse(JSON.parse(res.text));
      if (parsed.success) data = parsed.data;
    } catch {
      // Truncated or malformed JSON: report as no data.
    }
  }
  return { data, model: res.modelVersion ?? model, stopReason: finish, usage };
};
