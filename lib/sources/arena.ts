import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { ARENA_ORGS } from "@/config/tech";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// What an AI model costs against how good people find it: LMArena's text
// leaderboard (published as a Hugging Face dataset; lmarena.ai itself sits
// behind Cloudflare), joined with OpenRouter's prices. The datasets-server's
// cached first rows are the top 100 of the overall ranking, enough for the
// models anyone compares; its full /rows endpoint often answers 5xx.

const Arena = z.object({
  rows: z.array(
    z.object({
      row: z.object({
        model_name: z.string(),
        organization: z.string(),
        rating: z.number(),
        rank: z.number(),
        vote_count: z.number().nullish(),
        category: z.string(),
        leaderboard_publish_date: z.string().nullish(),
      }),
    }),
  ),
});

const OpenRouter = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pricing: z.object({ prompt: z.string().nullish(), completion: z.string().nullish() }).nullish(),
      hugging_face_id: z.string().nullish(),
    }),
  ),
});

export interface AiValue {
  /** OpenRouter's display name and id. */
  name: string;
  id: string;
  org: string;
  /** Arena rating (Elo-like) of the best-rated variant ("High", "Max" effort…) and its rank. */
  rating: number;
  rank: number;
  /** US$ per million tokens. */
  priceIn: number;
  priceOut: number;
  /** Blended price for a typical 3:1 input:output mix. */
  blended: number;
  open: boolean;
  /** Leaderboard date. */
  date: string | null;
}

/** Lowercase name with effort and date tags, "preview"/"beta" and punctuation dropped: "Qwen3.8-Max-Preview (0902)" → "qwen3.8 max". */
export function modelKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/-/g, " ")
    .replace(/\b(preview|beta|latest|instruct|chat)\b/g, " ")
    .replace(/\b\d{4,8}\b/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const perMillion = (s: string | null | undefined) => {
  const v = Number(s);
  return s != null && s !== "" && Number.isFinite(v) && v >= 0 ? v * 1e6 : null;
};

/** Arena rows joined to OpenRouter models by organisation and name; one entry per OpenRouter model (its best-rated variant), paid models only. */
export function joinArena(arena: z.infer<typeof Arena>["rows"], models: z.infer<typeof OpenRouter>["data"]): AiValue[] {
  const index = models
    .filter((m) => !m.id.includes(":") && m.id.includes("/"))
    .map((m) => {
      const sep = m.name.indexOf(": ");
      const display = sep > 0 ? m.name.slice(sep + 2) : m.name;
      return { m, display, org: m.id.split("/")[0], key: modelKey(display), slug: modelKey(m.id.split("/")[1]) };
    });
  const best = new Map<string, AiValue>();
  for (const { row: a } of arena) {
    if (a.category !== "overall") continue;
    const key = modelKey(a.model_name);
    const orgs = ARENA_ORGS[a.organization] ?? [a.organization];
    const hit = index.find((o) => orgs.includes(o.org) && (o.key === key || o.slug === key));
    if (!hit) continue;
    const priceIn = perMillion(hit.m.pricing?.prompt);
    const priceOut = perMillion(hit.m.pricing?.completion);
    if (priceIn === null || priceOut === null || priceIn + priceOut === 0) continue;
    const prev = best.get(hit.m.id);
    if (prev && prev.rating >= a.rating) continue;
    best.set(hit.m.id, {
      name: hit.display,
      id: hit.m.id,
      org: hit.org,
      rating: a.rating,
      rank: a.rank,
      priceIn,
      priceOut,
      blended: (3 * priceIn + priceOut) / 4,
      open: Boolean(hit.m.hugging_face_id),
      date: a.leaderboard_publish_date ?? null,
    });
  }
  return [...best.values()].sort((a, b) => b.rating - a.rating);
}

export const arena: Source = {
  id: "arena",
  ...SOURCE_META.arena,
  async run({ db, log }) {
    const [a, or] = await Promise.all([
      fetchJson("https://datasets-server.huggingface.co/first-rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=text&split=latest", Arena, { timeoutMs: 40_000 }),
      fetchJson("https://openrouter.ai/api/v1/models", OpenRouter, { timeoutMs: 30_000 }),
    ]);
    const rows = joinArena(a.rows, or.data);
    if (rows.length < 10) throw new Error(`only ${rows.length} arena models matched OpenRouter prices`);
    log(`${rows.length} of ${a.rows.length} arena models priced on OpenRouter`);
    return replaceItems(db, "ai_value", rows.map((r) => ({ id: r.id, title: r.name, url: `https://openrouter.ai/${r.id}`, data: r })));
  },
};
