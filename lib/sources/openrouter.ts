import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// New AI models and their prices, from OpenRouter's public model list (no key).
// `created` is when a model was added to OpenRouter, which for most models is
// within days of its release.

const DAY = 24 * 3600_000;
const WINDOW_DAYS = 30;
const MAX_MODELS = 80;

const Model = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  context_length: z.number().nullish(),
  hugging_face_id: z.string().nullish(),
  pricing: z.object({ prompt: z.string().nullish(), completion: z.string().nullish() }).nullish(),
  architecture: z.object({ input_modalities: z.array(z.string()).nullish(), output_modalities: z.array(z.string()).nullish() }).nullish(),
});
const Resp = z.object({ data: z.array(Model) });

export interface AiModel {
  provider: string;
  name: string;
  /** ms epoch the model was listed. */
  created: number;
  context: number | null;
  /** US$ per million tokens; null when OpenRouter prices it dynamically (routers) or not at all. */
  priceIn: number | null;
  priceOut: number | null;
  /** Weights published on Hugging Face. */
  open: boolean;
  inputs: string[];
  outputs: string[];
}

/** Price per million tokens from OpenRouter's per-token string; negative means "varies". */
function perMillion(s: string | null | undefined): number | null {
  const v = Number(s);
  return s != null && s !== "" && Number.isFinite(v) && v >= 0 ? Math.round(v * 1e6 * 1e4) / 1e4 : null;
}

/**
 * Models listed in the last `days`, newest first. Variants (":free", ":batch"...) and aliases ("~vendor/latest",
 * "openrouter/auto") repeat a model already in the list and are dropped.
 */
export function pickNewModels(models: z.infer<typeof Model>[], now: number, days = WINDOW_DAYS): (AiModel & { id: string })[] {
  return models
    .filter((m) => !m.id.includes(":") && !m.id.startsWith("~") && !m.id.startsWith("openrouter/") && now - m.created * 1000 <= days * DAY)
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
    .map((m) => {
      const sep = m.name.indexOf(": ");
      return {
        id: m.id,
        provider: sep > 0 ? m.name.slice(0, sep) : m.id.split("/")[0],
        name: sep > 0 ? m.name.slice(sep + 2) : m.name,
        created: m.created * 1000,
        context: m.context_length ?? null,
        priceIn: perMillion(m.pricing?.prompt),
        priceOut: perMillion(m.pricing?.completion),
        open: Boolean(m.hugging_face_id),
        inputs: m.architecture?.input_modalities ?? [],
        outputs: m.architecture?.output_modalities ?? [],
      };
    });
}

export const openrouter: Source = {
  id: "openrouter",
  ...SOURCE_META.openrouter,
  async run({ db }) {
    const r = await fetchJson("https://openrouter.ai/api/v1/models", Resp, { timeoutMs: 30_000 });
    if (!r.data.length) throw new Error("OpenRouter returned no models");
    const fresh = pickNewModels(r.data, Date.now()).slice(0, MAX_MODELS);
    return replaceItems(
      db,
      "ai_models",
      fresh.map(({ id, ...m }) => ({ id, title: m.name, url: `https://openrouter.ai/${id}`, ts: m.created, data: m })),
    );
  },
};
