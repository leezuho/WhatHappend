import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { ARENA_ORGS } from "@/config/tech";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// What an AI model costs against how good people find it: LMArena's text
// leaderboard (published as a Hugging Face dataset; lmarena.ai itself sits
// behind Cloudflare), joined with OpenRouter's prices. The datasets-server's
// cached first rows are the top 100 of the overall ranking; ranks 101–300 come
// from its /rows endpoint, which sometimes answers 5xx, so those pages are
// best effort. They matter: a new lab's small or mid-size model, and a new
// flagship still collecting votes, often sit below rank 100.
//
// The leaderboard keeps every model it ever rated, so the chart keeps only the
// newest model of each line and none OpenRouter has sold for over a year.

const DAY = 24 * 3600_000;
const DATASET = "https://datasets-server.huggingface.co";
const SPLIT = "dataset=lmarena-ai%2Fleaderboard-dataset&config=text&split=latest";
/** Offsets of the /rows pages read after the cached first 100 rows. */
const MORE_OFFSETS = [100, 200];
/** Off the chart once OpenRouter has listed a model this long. */
const MAX_AGE_DAYS = 365;
/** OpenRouter models listed this recently that LMArena has not rated are named under the chart. */
const NEW_DAYS = 30;

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
      /** Seconds epoch OpenRouter listed the model. */
      created: z.number().nullish(),
      pricing: z.object({ prompt: z.string().nullish(), completion: z.string().nullish() }).nullish(),
      hugging_face_id: z.string().nullish(),
      architecture: z.object({ output_modalities: z.array(z.string()).nullish() }).nullish(),
    }),
  ),
});
type OrModel = z.infer<typeof OpenRouter>["data"][number];

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
  /** ms epoch OpenRouter listed the model. */
  listed: number | null;
}

/** A recent OpenRouter model LMArena has not rated yet (kind `ai_value_new`). */
export interface AiUnrated {
  name: string;
  id: string;
  /** ms epoch OpenRouter listed it. */
  listed: number;
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

/**
 * A model's line, its name without the version: "Claude Opus 4.6" and "Claude 3.5 Sonnet" → "claude opus", "claude sonnet";
 * "Kimi K3.1 Pro" → "kimi k pro". Sizes stay, a 27B and a 397B are different models: "Qwen3.8 27B" → "qwen 27b".
 */
export function modelLine(name: string): string {
  return modelKey(name)
    .split(" ")
    .map((t) => (/^[ae]?\d+(\.\d+)?[bm]$/.test(t) ? t : t.replace(/[\d.]+/g, "")))
    .filter(Boolean)
    .join(" ");
}

const listedAt = (m: OrModel) => (m.created ? m.created * 1000 : null);

const perMillion = (s: string | null | undefined) => {
  const v = Number(s);
  return s != null && s !== "" && Number.isFinite(v) && v >= 0 ? v * 1e6 : null;
};

/** Arena rows joined to OpenRouter models by organisation and name; one entry per OpenRouter model (its best-rated variant), paid models only. */
export function joinArena(arena: z.infer<typeof Arena>["rows"], models: OrModel[]): AiValue[] {
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
    // "NVIDIA-Nemotron-3-Ultra-550B-A55B" is "Nemotron 3 Ultra" (nvidia/nemotron-3-ultra-550b-a55b) on OpenRouter.
    const bare = a.organization && key.startsWith(`${a.organization} `) ? key.slice(a.organization.length + 1) : key;
    const orgs = ARENA_ORGS[a.organization] ?? [a.organization];
    const hit = index.find((o) => orgs.includes(o.org) && (o.key === key || o.slug === key || o.slug === bare));
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
      listed: listedAt(hit.m),
    });
  }
  return [...best.values()].sort((a, b) => b.rating - a.rating);
}

/**
 * What the chart shows: the newest model of each line by OpenRouter listing date (Claude Opus 5.5, not also Opus 4.6,
 * 4.7 and 4.8), and nothing OpenRouter has listed for more than `MAX_AGE_DAYS`. Order is kept.
 */
export function latestLines(rows: AiValue[], now: number): AiValue[] {
  const newest = new Map<string, AiValue>();
  for (const r of rows) {
    const line = `${r.org}/${modelLine(r.name)}`;
    const prev = newest.get(line);
    if (!prev || (r.listed ?? 0) > (prev.listed ?? 0)) newest.set(line, r);
  }
  const keep = new Set(newest.values());
  return rows.filter((r) => keep.has(r) && (r.listed === null || now - r.listed <= MAX_AGE_DAYS * DAY));
}

/**
 * Text models OpenRouter listed in the last `NEW_DAYS` days, from labs already on the chart, that matched no
 * leaderboard row: the new releases still collecting votes. Newest first; free models, variants and aliases left out.
 */
export function unratedNew(models: OrModel[], rated: Set<string>, orgs: Set<string>, now: number): AiUnrated[] {
  return models
    .filter((m) => {
      const listed = listedAt(m);
      const pIn = perMillion(m.pricing?.prompt);
      const pOut = perMillion(m.pricing?.completion);
      const outputs = m.architecture?.output_modalities;
      return (
        listed !== null &&
        now - listed <= NEW_DAYS * DAY &&
        !m.id.includes(":") &&
        orgs.has(m.id.split("/")[0]) &&
        !rated.has(m.id) &&
        (!outputs || outputs.includes("text")) &&
        pIn !== null &&
        pOut !== null &&
        pIn + pOut > 0
      );
    })
    .map((m) => {
      const sep = m.name.indexOf(": ");
      return { name: sep > 0 ? m.name.slice(sep + 2) : m.name, id: m.id, listed: listedAt(m)! };
    })
    .sort((a, b) => b.listed - a.listed || a.id.localeCompare(b.id));
}

export const arena: Source = {
  id: "arena",
  ...SOURCE_META.arena,
  async run({ db, log }) {
    const [top, or, more] = await Promise.all([
      fetchJson(`${DATASET}/first-rows?${SPLIT}`, Arena, { timeoutMs: 40_000 }),
      fetchJson("https://openrouter.ai/api/v1/models", OpenRouter, { timeoutMs: 30_000 }),
      Promise.all(
        MORE_OFFSETS.map((o) =>
          fetchJson(`${DATASET}/rows?${SPLIT}&offset=${o}&length=100`, Arena, { timeoutMs: 40_000 }).catch((e: unknown) => {
            log(`ranks ${o + 1}–${o + 100} not read: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          }),
        ),
      ),
    ]);
    const board = [...top.rows, ...more.flatMap((p) => p?.rows ?? [])];
    const all = joinArena(board, or.data);
    if (all.length < 10) throw new Error(`only ${all.length} arena models matched OpenRouter prices`);
    const now = Date.now();
    const rows = latestLines(all, now);
    const fresh = unratedNew(or.data, new Set(all.map((r) => r.id)), new Set(rows.map((r) => r.org)), now);
    log(`${all.length} of ${board.length} arena models priced on OpenRouter, ${rows.length} newest of their line; ${fresh.length} new models not rated yet`);
    replaceItems(db, "ai_value_new", fresh.map((m) => ({ id: m.id, title: m.name, url: `https://openrouter.ai/${m.id}`, ts: m.listed, data: m })));
    return replaceItems(db, "ai_value", rows.map((r) => ({ id: r.id, title: r.name, url: `https://openrouter.ai/${r.id}`, data: r })));
  },
};
